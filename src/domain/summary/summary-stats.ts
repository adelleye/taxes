import { looksLikeWhtCredit } from "@/domain/transaction-flags";
import type { TaxSuggestion, Transaction } from "@/domain/types";

// Services WHT for resident companies under the Deduction at Source
// (Withholding) Regulations 2024; goods and most other services are 2%.
const DEFAULT_WHT_RATE = 0.05;

export interface TransactionTotals {
  revenue: number;
  operatingExpenses: number;
  payroll: number;
  capitalAssets: number;
  nonRevenueInflows: number;
  ownerDrawings: number;
  inferredWhtCredits: number;
}

export interface SuggestionStats {
  countByRuleId: Map<string, number>;
  impactByRuleId: Map<string, number>;
}

export function summarizeTransactionTotals(transactions: Transaction[]): TransactionTotals {
  const totals: TransactionTotals = {
    revenue: 0,
    operatingExpenses: 0,
    payroll: 0,
    capitalAssets: 0,
    nonRevenueInflows: 0,
    ownerDrawings: 0,
    inferredWhtCredits: 0
  };

  for (const transaction of transactions) {
    switch (transaction.category) {
      case "revenue":
        totals.revenue += transaction.credit;
        break;
      case "operating_expense":
        totals.operatingExpenses += transaction.debit;
        break;
      case "payroll":
        totals.payroll += transaction.debit;
        break;
      case "capital_asset":
        totals.capitalAssets += transaction.debit;
        break;
      case "director_funding":
      case "reversal":
        totals.nonRevenueInflows += transaction.credit;
        break;
      case "owner_drawings":
        totals.ownerDrawings += transaction.debit;
        break;
      case "tax_payment":
      case "uncategorized":
        break;
    }

    if (looksLikeWhtCredit(transaction)) {
      totals.inferredWhtCredits += Math.round(
        (transaction.credit / (1 - DEFAULT_WHT_RATE)) * DEFAULT_WHT_RATE
      );
    }
  }

  return totals;
}

export function summarizeSuggestionStats(suggestions: TaxSuggestion[]): SuggestionStats {
  const countByRuleId = new Map<string, number>();
  const impactByRuleId = new Map<string, number>();

  for (const suggestion of suggestions) {
    countByRuleId.set(suggestion.ruleId, (countByRuleId.get(suggestion.ruleId) ?? 0) + 1);
    impactByRuleId.set(
      suggestion.ruleId,
      (impactByRuleId.get(suggestion.ruleId) ?? 0) + suggestion.estimatedTaxImpact.amount
    );
  }

  return { countByRuleId, impactByRuleId };
}

export function countRule(stats: SuggestionStats, ruleId: string): number {
  return stats.countByRuleId.get(ruleId) ?? 0;
}

export function sumRuleImpact(stats: SuggestionStats, ruleId: string): number {
  return stats.impactByRuleId.get(ruleId) ?? 0;
}
