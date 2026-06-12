import type { Transaction, TransactionCategory } from "@/domain/types";
import { includesAnyKeyword } from "@/domain/text-match";

interface ClassificationMatch {
  category: TransactionCategory;
  confidence: number;
}

/** Debits at or below this are presumed bank charges whatever the narration says. */
const MICRO_DEBIT_BANK_CHARGE_LIMIT = 1000;

// Keyword groups live at module scope so classifying a statement doesn't
// re-allocate them per row. Keywords match on word boundaries, so plural and
// variant forms must be listed explicitly ("LAPTOP" no longer matches
// "LAPTOPS"). Precision over recall by design: a missed match lands in
// "uncategorized", where RULE_UNCATEGORIZED_EXPENSE forces a human decision —
// a wrong match would silently distort the tax estimate instead.
const DIRECTOR_FUNDING_KEYWORDS = ["TRANSFER FROM DIRECTOR", "DIRECTOR FUNDING", "WORKING CAPITAL"];

const REVERSAL_KEYWORDS = ["REVERSAL", "REVERSALS", "TRANSFER ERROR", "NIP TRANSFER ERROR"];

const KNOWN_REVENUE_KEYWORDS = ["CUSTOMER PAYMENT", "PAYSTACK SETTLEMENT", "INV-"];

const PAYROLL_KEYWORDS = ["SALARY", "SALARIES", "PAYROLL", "PENSION", "PAYE"];

const CAPITAL_ASSET_KEYWORDS = [
  "LAPTOP",
  "LAPTOPS",
  "GENERATOR",
  "GENERATORS",
  "VEHICLE",
  "VEHICLES",
  "MACHINERY",
  "EQUIPMENT"
];

const OWNER_DRAWINGS_KEYWORDS = ["FOUNDER DRAWING", "DIRECTOR DRAWING", "OWNER DRAWING"];

// Bank charges, duties and levies — the bulk of rows on a real Nigerian
// statement (NIP commission, stamp duty, SMS alerts, fee VAT). Deductible
// operating expenses, NOT tax payments: stamp duty and fee VAT reduce
// profit, while the tax_payment bucket is excluded from deductions.
const BANK_CHARGE_KEYWORDS = [
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
];

// Card / POS / web purchases on a business account — presumed business
// expenses at lower confidence so they still read as worth a glance.
const CARD_PURCHASE_KEYWORDS = [
  "POS PURCHASE",
  "POINT OF SALE PURCHASE",
  "WEB PURCHASE",
  "CARD PURCHASE"
];

const GENERAL_EXPENSE_KEYWORDS = [
  "OFFICE RENT",
  "RENT",
  "DIESEL",
  "SUPPLY",
  "SUPPLIES",
  "VENDOR",
  "VENDORS"
];

// Professional and contractor fees — operating expense, NOT payroll:
// payroll is employees on PAYE; contractors are services (and payments to
// them may carry a WHT deduction obligation instead).
const PROFESSIONAL_FEE_KEYWORDS = [
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
];

// Recognisable service vendors on a Nigerian business account — hosting,
// payments, telco, power, software. A curated list, not a guess: each name
// is unambiguous enough that a wrong match is unlikely.
const SERVICE_VENDOR_KEYWORDS = [
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
];

const TAX_PAYMENT_KEYWORDS = [
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
];

export function classifyTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.map((transaction) => {
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
  });
}

export function classifyTransactionText(
  text: string,
  debit: number,
  credit: number
): ClassificationMatch {
  const normalized = text.toUpperCase();

  if (credit > 0 && includesAnyKeyword(normalized, DIRECTOR_FUNDING_KEYWORDS)) {
    return { category: "director_funding", confidence: 0.94 };
  }

  if (includesAnyKeyword(normalized, REVERSAL_KEYWORDS)) {
    return { category: "reversal", confidence: 0.9 };
  }

  if (credit > 0 && includesAnyKeyword(normalized, KNOWN_REVENUE_KEYWORDS)) {
    return { category: "revenue", confidence: 0.92 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, PAYROLL_KEYWORDS)) {
    return { category: "payroll", confidence: 0.95 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, CAPITAL_ASSET_KEYWORDS)) {
    return { category: "capital_asset", confidence: 0.91 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, OWNER_DRAWINGS_KEYWORDS)) {
    return { category: "owner_drawings", confidence: 0.9 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, BANK_CHARGE_KEYWORDS)) {
    return { category: "operating_expense", confidence: 0.9 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, CARD_PURCHASE_KEYWORDS)) {
    return { category: "operating_expense", confidence: 0.7 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, GENERAL_EXPENSE_KEYWORDS)) {
    return { category: "operating_expense", confidence: 0.86 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, PROFESSIONAL_FEE_KEYWORDS)) {
    return { category: "operating_expense", confidence: 0.8 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, SERVICE_VENDOR_KEYWORDS)) {
    return { category: "operating_expense", confidence: 0.75 };
  }

  if (debit > 0 && includesAnyKeyword(normalized, TAX_PAYMENT_KEYWORDS)) {
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
