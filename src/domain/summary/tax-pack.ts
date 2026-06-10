import type {
  BusinessProfile,
  ReviewOutput,
  TaxPack,
  TaxPackSummary,
  TaxSuggestion,
  TaxCase,
  Transaction
} from "@/domain/types";
import { estimateProjectedTaxPositionFromStats } from "@/domain/summary/tax-position";
import {
  countRule,
  summarizeSuggestionStats,
  summarizeTransactionTotals
} from "@/domain/summary/summary-stats";

export function summarizeTaxPack(
  transactions: Transaction[],
  profile: BusinessProfile,
  suggestions: TaxSuggestion[] = []
): TaxPackSummary {
  const transactionTotals = summarizeTransactionTotals(transactions);
  const suggestionStats = summarizeSuggestionStats(suggestions);

  return {
    revenue: transactionTotals.revenue,
    operatingExpenses: transactionTotals.operatingExpenses,
    payroll: transactionTotals.payroll,
    capitalAssets: transactionTotals.capitalAssets,
    nonRevenueInflows: transactionTotals.nonRevenueInflows,
    ownerDrawings: transactionTotals.ownerDrawings,
    vatCandidateCount: countRule(suggestionStats, "RULE_VAT_INPUT_CANDIDATE"),
    whtCandidateCount: countRule(suggestionStats, "RULE_WHT_CREDIT_CANDIDATE"),
    payrollRiskCount: countRule(suggestionStats, "RULE_PAYE_RISK"),
    capitalAssetCandidateCount: countRule(suggestionStats, "RULE_CAPITAL_ASSET_CANDIDATE"),
    missingEvidenceCount: countRule(suggestionStats, "RULE_MISSING_EVIDENCE_MATERIAL_EXPENSE"),
    transactionCount: transactions.length,
    projectedTaxPosition: estimateProjectedTaxPositionFromStats(transactionTotals, suggestionStats, profile)
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
