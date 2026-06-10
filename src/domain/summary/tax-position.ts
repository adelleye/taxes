import type {
  BusinessProfile,
  ProjectedTaxPosition,
  TaxSuggestion,
  Transaction,
  TurnoverBand
} from "@/domain/types";
import {
  sumRuleImpact,
  summarizeSuggestionStats,
  summarizeTransactionTotals,
  type SuggestionStats,
  type TransactionTotals
} from "@/domain/summary/summary-stats";

// Nigeria Tax Act 2025, effective 1 Jan 2026: companies are either small
// (0% CIT, exempt from the Development Levy) or standard (30% CIT + 4%
// Development Levy on assessable profits). The old 20% medium band is gone.
const STANDARD_CIT_RATE = 0.3;
const DEVELOPMENT_LEVY_RATE = 0.04;

const SMALL_COMPANY_TURNOVER_BANDS: ReadonlySet<TurnoverBand> = new Set([
  "NGN_0_25M",
  "NGN_25M_100M"
]);

/**
 * NTA 2025 small-company test: turnover ≤ ₦100m AND total fixed assets
 * ≤ ₦250m. The asset half must be confirmed by the user; until then we tax
 * at the standard rate so the estimate can overstate but never understate.
 */
export function isSmallCompany(profile: BusinessProfile): boolean {
  return SMALL_COMPANY_TURNOVER_BANDS.has(profile.turnoverBand) && profile.fixedAssetsUnder250m;
}

export function estimateProjectedTaxPosition(
  transactions: Transaction[],
  profile: BusinessProfile,
  suggestions: TaxSuggestion[] = []
): ProjectedTaxPosition {
  return estimateProjectedTaxPositionFromStats(
    summarizeTransactionTotals(transactions),
    summarizeSuggestionStats(suggestions),
    profile
  );
}

export function estimateProjectedTaxPositionFromStats(
  totals: TransactionTotals,
  suggestionStats: SuggestionStats,
  profile: BusinessProfile
): ProjectedTaxPosition {
  const taxableProfitEstimate = Math.max(totals.revenue - totals.operatingExpenses - totals.payroll, 0);
  const small = isSmallCompany(profile);
  const rate = small ? 0 : STANDARD_CIT_RATE;
  const developmentLevyRate = small ? 0 : DEVELOPMENT_LEVY_RATE;
  const estimatedCit = Math.round(taxableProfitEstimate * rate);
  const estimatedDevelopmentLevy = Math.round(taxableProfitEstimate * developmentLevyRate);
  const potentialWhtCredits =
    sumRuleImpact(suggestionStats, "RULE_WHT_CREDIT_CANDIDATE") || totals.inferredWhtCredits;
  const netAmount = estimatedCit + estimatedDevelopmentLevy - potentialWhtCredits;

  return {
    taxableProfitEstimate,
    companySize: small ? "small" : "standard",
    estimatedCit,
    estimatedDevelopmentLevy,
    potentialWhtCredits,
    netAmount,
    direction: netAmount > 0 ? "payable" : netAmount < 0 ? "credit" : "neutral",
    rate,
    developmentLevyRate,
    basis: small
      ? "Small company under the Nigeria Tax Act 2025 (turnover ≤ ₦100m and fixed assets ≤ ₦250m): 0% CIT and exempt from the Development Levy. WHT already deducted from receipts may be recoverable as a credit."
      : "Standard company under the Nigeria Tax Act 2025: 30% CIT plus the 4% Development Levy on profit (classified revenue less operating expenses and payroll), reduced by deterministic WHT credit candidates. Capital allowances are not deducted here."
  };
}
