import type { ProjectedTaxPosition, TaxSuggestion, Transaction } from "@/domain/types";

const STANDARD_COMPANY_CIT_RATE = 0.3;
const DEFAULT_WHT_RATE = 0.05;

export function estimateProjectedTaxPosition(
  transactions: Transaction[],
  suggestions: TaxSuggestion[] = []
): ProjectedTaxPosition {
  const revenue = sumTransactions(transactions, "revenue", "credit");
  const operatingExpenses = sumTransactions(transactions, "operating_expense", "debit");
  const payroll = sumTransactions(transactions, "payroll", "debit");
  const taxableProfitEstimate = Math.max(revenue - operatingExpenses - payroll, 0);
  const estimatedCit = Math.round(taxableProfitEstimate * STANDARD_COMPANY_CIT_RATE);
  const potentialWhtCredits =
    sumRuleImpact(suggestions, "RULE_WHT_CREDIT_CANDIDATE") || inferWhtCredits(transactions);
  const netAmount = estimatedCit - potentialWhtCredits;

  return {
    taxableProfitEstimate,
    estimatedCit,
    potentialWhtCredits,
    netAmount,
    direction: netAmount > 0 ? "payable" : netAmount < 0 ? "credit" : "neutral",
    rate: STANDARD_COMPANY_CIT_RATE,
    basis:
      "Preliminary CIT estimate on classified revenue less operating expense and payroll, reduced by deterministic WHT credit candidates. Capital assets are not expensed here."
  };
}

function inferWhtCredits(transactions: Transaction[]): number {
  return transactions
    .filter((transaction) => transaction.credit > 0)
    .filter((transaction) => transaction.description.toUpperCase().includes("WHT"))
    .reduce((total, transaction) => total + Math.round((transaction.credit / (1 - DEFAULT_WHT_RATE)) * DEFAULT_WHT_RATE), 0);
}

function sumRuleImpact(suggestions: TaxSuggestion[], ruleId: string): number {
  return suggestions
    .filter((suggestion) => suggestion.ruleId === ruleId)
    .reduce((total, suggestion) => total + suggestion.estimatedTaxImpact.amount, 0);
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
