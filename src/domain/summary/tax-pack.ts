import type {
  ReviewOutput,
  TaxPack,
  TaxPackSummary,
  TaxSuggestion,
  TaxCase,
  Transaction
} from "@/domain/types";
import { estimateProjectedTaxPosition } from "@/domain/summary/tax-position";

export function summarizeTaxPack(
  transactions: Transaction[],
  suggestions: TaxSuggestion[] = []
): TaxPackSummary {
  return {
    revenue: sumTransactions(transactions, "revenue", "credit"),
    operatingExpenses: sumTransactions(transactions, "operating_expense", "debit"),
    payroll: sumTransactions(transactions, "payroll", "debit"),
    capitalAssets: sumTransactions(transactions, "capital_asset", "debit"),
    nonRevenueInflows:
      sumTransactions(transactions, "director_funding", "credit") +
      sumTransactions(transactions, "reversal", "credit"),
    ownerDrawings: sumTransactions(transactions, "owner_drawings", "debit"),
    vatCandidateCount: countRule(suggestions, "RULE_VAT_INPUT_CANDIDATE"),
    whtCandidateCount: countRule(suggestions, "RULE_WHT_CREDIT_CANDIDATE"),
    payrollRiskCount: countRule(suggestions, "RULE_PAYE_RISK"),
    capitalAssetCandidateCount: countRule(suggestions, "RULE_CAPITAL_ASSET_CANDIDATE"),
    missingEvidenceCount: countRule(suggestions, "RULE_MISSING_EVIDENCE_MATERIAL_EXPENSE"),
    transactionCount: transactions.length,
    projectedTaxPosition: estimateProjectedTaxPosition(transactions, suggestions)
  };
}

export function buildTaxPack(
  taxCase: TaxCase,
  transactions: Transaction[],
  review: ReviewOutput,
  exportedAt = new Date().toISOString()
): TaxPack {
  return {
    taxCase,
    transactions,
    review,
    exportedAt
  };
}

function sumTransactions(
  transactions: Transaction[],
  category: Transaction["category"],
  side: "debit" | "credit"
): number {
  return transactions
    .filter((transaction) => transaction.category === category)
    .reduce((total, transaction) => total + transaction[side], 0);
}

function countRule(suggestions: TaxSuggestion[], ruleId: string): number {
  return suggestions.filter((suggestion) => suggestion.ruleId === ruleId).length;
}
