import type { ClassifierAdapter } from "@/adapters/contracts";
import type { BusinessProfile, Transaction, TransactionCategory } from "@/domain/types";

interface ClassificationMatch {
  category: TransactionCategory;
  confidence: number;
}

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

export function classifyTransactionText(
  text: string,
  debit: number,
  credit: number
): ClassificationMatch {
  const normalized = text.toUpperCase();

  if (credit > 0 && includesAny(normalized, ["TRANSFER FROM DIRECTOR", "DIRECTOR FUNDING", "WORKING CAPITAL"])) {
    return { category: "director_funding", confidence: 0.94 };
  }

  if (includesAny(normalized, ["REVERSAL", "TRANSFER ERROR", "NIP TRANSFER ERROR"])) {
    return { category: "reversal", confidence: 0.9 };
  }

  if (credit > 0 && includesAny(normalized, ["CUSTOMER PAYMENT", "PAYSTACK SETTLEMENT", "INV-"])) {
    return { category: "revenue", confidence: 0.92 };
  }

  if (debit > 0 && includesAny(normalized, ["SALARY", "PAYROLL", "PENSION", "PAYE"])) {
    return { category: "payroll", confidence: 0.95 };
  }

  if (debit > 0 && includesAny(normalized, ["LAPTOP", "GENERATOR", "VEHICLE", "MACHINERY", "EQUIPMENT"])) {
    return { category: "capital_asset", confidence: 0.91 };
  }

  if (debit > 0 && includesAny(normalized, ["FOUNDER DRAWING", "DIRECTOR DRAWING", "OWNER DRAWING"])) {
    return { category: "owner_drawings", confidence: 0.9 };
  }

  if (debit > 0 && includesAny(normalized, ["OFFICE RENT", "RENT", "DIESEL", "SUPPLY", "VENDOR"])) {
    return { category: "operating_expense", confidence: 0.86 };
  }

  if (debit > 0 && includesAny(normalized, ["FIRS", "LIRS", "VAT", "CIT", "WHT REMITTANCE"])) {
    return { category: "tax_payment", confidence: 0.88 };
  }

  return { category: "uncategorized", confidence: 0.45 };
}

function includesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}
