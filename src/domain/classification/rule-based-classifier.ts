import type { ClassifierAdapter } from "@/adapters/contracts";
import type { BusinessProfile, Transaction, TransactionCategory } from "@/domain/types";
import { includesAnyKeyword } from "@/domain/text-match";

interface ClassificationMatch {
  category: TransactionCategory;
  confidence: number;
}

/** Debits at or below this are presumed bank charges whatever the narration says. */
const MICRO_DEBIT_BANK_CHARGE_LIMIT = 1000;

export class RuleBasedClassifier implements ClassifierAdapter {
  classify(transaction: Transaction): Transaction {
    const match = classifyTransactionText(
      `${transaction.description} ${transaction.counterparty}`,
      transaction.debit,
      transaction.credit
    );

    return {
      ...transaction,
      category: match.category,
      confidence: match.confidence
    };
  }

  classifyBatch(transactions: Transaction[], profile: BusinessProfile): Transaction[] {
    void profile;
    return transactions.map((transaction) => this.classify(transaction));
  }
}

// Keywords match on word boundaries, so plural and variant forms must be
// listed explicitly ("LAPTOP" no longer matches "LAPTOPS"). Precision over
// recall by design: a missed match lands in "uncategorized", where
// RULE_UNCATEGORIZED_EXPENSE forces a human decision — a wrong match would
// silently distort the tax estimate instead.
export function classifyTransactionText(
  text: string,
  debit: number,
  credit: number
): ClassificationMatch {
  const normalized = text.toUpperCase();

  if (credit > 0 && includesAnyKeyword(normalized, ["TRANSFER FROM DIRECTOR", "DIRECTOR FUNDING", "WORKING CAPITAL"])) {
    return { category: "director_funding", confidence: 0.94 };
  }

  if (includesAnyKeyword(normalized, ["REVERSAL", "REVERSALS", "TRANSFER ERROR", "NIP TRANSFER ERROR"])) {
    return { category: "reversal", confidence: 0.9 };
  }

  if (credit > 0 && includesAnyKeyword(normalized, ["CUSTOMER PAYMENT", "PAYSTACK SETTLEMENT", "INV-"])) {
    return { category: "revenue", confidence: 0.92 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, ["SALARY", "SALARIES", "PAYROLL", "PENSION", "PAYE"])) {
    return { category: "payroll", confidence: 0.95 };
  }

  if (
    debit > 0 &&
    includesAnyKeyword(normalized, [
      "LAPTOP",
      "LAPTOPS",
      "GENERATOR",
      "GENERATORS",
      "VEHICLE",
      "VEHICLES",
      "MACHINERY",
      "EQUIPMENT"
    ])
  ) {
    return { category: "capital_asset", confidence: 0.91 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, ["FOUNDER DRAWING", "DIRECTOR DRAWING", "OWNER DRAWING"])) {
    return { category: "owner_drawings", confidence: 0.9 };
  }

  // Bank charges, duties and levies — the bulk of rows on a real Nigerian
  // statement (NIP commission, stamp duty, SMS alerts, fee VAT). Deductible
  // operating expenses, NOT tax payments: stamp duty and fee VAT reduce
  // profit, while the tax_payment bucket is excluded from deductions.
  if (
    debit > 0 &&
    includesAnyKeyword(normalized, [
      "COMMISSION",
      "STAMP DUTY",
      "EMT LEVY",
      "ELECTRONIC MONEY TRANSFER LEVY",
      "TRANSFER LEVY",
      "TRANSFER FEE",
      "NIP CHARGE",
      "SMS ALERT",
      "SMS CHARGE",
      "ALERT CHARGE",
      "ACCOUNT MAINTENANCE",
      "MAINTENANCE FEE",
      "BANK CHARGE",
      "BANK CHARGES",
      "SERVICE CHARGE",
      "USSD CHARGE",
      "VAT ON",
      "VALUE ADDED TAX"
    ])
  ) {
    return { category: "operating_expense", confidence: 0.9 };
  }

  // Card / POS / web purchases on a business account — presumed business
  // expenses at lower confidence so they still read as worth a glance.
  if (
    debit > 0 &&
    includesAnyKeyword(normalized, [
      "POS PURCHASE",
      "POINT OF SALE PURCHASE",
      "WEB PURCHASE",
      "CARD PURCHASE"
    ])
  ) {
    return { category: "operating_expense", confidence: 0.7 };
  }

  if (
    debit > 0 &&
    includesAnyKeyword(normalized, ["OFFICE RENT", "RENT", "DIESEL", "SUPPLY", "SUPPLIES", "VENDOR", "VENDORS"])
  ) {
    return { category: "operating_expense", confidence: 0.86 };
  }

  // Professional and contractor fees — operating expense, NOT payroll:
  // payroll is employees on PAYE; contractors are services (and payments to
  // them may carry a WHT deduction obligation instead).
  if (
    debit > 0 &&
    includesAnyKeyword(normalized, [
      "TECHNICAL FEE",
      "TECHNICAL FEES",
      "PROFESSIONAL FEE",
      "PROFESSIONAL FEES",
      "CONSULTANCY",
      "CONSULTING FEE",
      "CONTRACTOR",
      "CONTRACTORS",
      "RETAINER",
      "LEGAL FEE",
      "LEGAL FEES",
      "AUDIT FEE",
      "AUDIT FEES"
    ])
  ) {
    return { category: "operating_expense", confidence: 0.8 };
  }

  // Recognisable service vendors on a Nigerian business account — hosting,
  // payments, telco, power, software. A curated list, not a guess: each name
  // is unambiguous enough that a wrong match is unlikely.
  if (
    debit > 0 &&
    includesAnyKeyword(normalized, [
      "HOST AFRICA",
      "HOSTAFRICA",
      "FLUTTERWAVE",
      "PAYSTACK",
      "INTERSWITCH",
      "REMITA",
      "GODADDY",
      "NAMECHEAP",
      "AWS",
      "AMAZON WEB SERVICES",
      "GOOGLE CLOUD",
      "GOOGLE WORKSPACE",
      "MICROSOFT",
      "ZOOM",
      "SLACK",
      "HOSTING",
      "DOMAIN RENEWAL",
      "SUBSCRIPTION",
      "MTN",
      "AIRTEL",
      "GLO NG",
      "9MOBILE",
      "SPECTRANET",
      "STARLINK",
      "DSTV",
      "EKEDC",
      "IKEDC",
      "AEDC",
      "PHCN",
      "INTERNET SUBSCRIPTION",
      "INTERNET SERVICE",
      "INTERNET BILL",
      "DATA BUNDLE",
      "AIRTIME",
      "FUEL",
      "UBER",
      "BOLT NG",
      "INSURANCE",
      "ADVERT",
      "ADVERTISEMENT",
      "ADVERTISING",
      "MARKETING",
      "SOFTWARE LICENSE",
      "SOFTWARE LICENCE"
    ])
  ) {
    return { category: "operating_expense", confidence: 0.75 };
  }

  if (
    debit > 0 &&
    includesAnyKeyword(normalized, [
      "FIRS",
      "NRS",
      "LIRS",
      "PAYE",
      "CIT",
      "WHT REMITTANCE",
      "VAT REMITTANCE",
      "VAT PAYMENT",
      "TAXPRO",
      "REV360"
    ])
  ) {
    return { category: "tax_payment", confidence: 0.88 };
  }

  // Unmatched inflows are presumed taxable revenue — the same stance a tax
  // auditor takes on unexplained business-account credits. Low confidence
  // keeps the row visibly unconfirmed, and reclassifying it (director
  // funding, reversal…) can only lower the estimate, never raise it.
  if (credit > 0) {
    return { category: "revenue", confidence: 0.55 };
  }

  // Micro-debits are bank-charge shaped regardless of narration (fee VAT,
  // levies, alerts). The only place we presume a deduction — justified
  // because amounts this small are immaterial by definition: even hundreds
  // of them cannot meaningfully understate the tax estimate.
  if (debit > 0 && debit <= MICRO_DEBIT_BANK_CHARGE_LIMIT) {
    return { category: "operating_expense", confidence: 0.6 };
  }

  return { category: "uncategorized", confidence: 0.45 };
}
