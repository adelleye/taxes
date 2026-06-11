export const TRANSACTION_CATEGORIES = [
  "revenue",
  "director_funding",
  "operating_expense",
  "payroll",
  "capital_asset",
  "owner_drawings",
  "reversal",
  "tax_payment",
  "uncategorized"
] as const;

export const EVIDENCE_STATUSES = [
  "none",
  "available",
  "uploaded",
  "not_applicable"
] as const;

export const SUGGESTION_STATUSES = ["open", "resolved"] as const;

export const USER_DECISIONS = [
  "pending",
  "accepted",
  "rejected",
  "needs_review"
] as const;

export const REVIEW_SEVERITIES = ["error", "warning", "suggestion"] as const;

export const TURNOVER_BANDS = [
  "NGN_0_25M",
  "NGN_25M_100M",
  "NGN_100M_300M",
  "NGN_300M_1B",
  "NGN_1B_PLUS"
] as const;

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
export type UserDecision = (typeof USER_DECISIONS)[number];
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];
export type TurnoverBand = (typeof TURNOVER_BANDS)[number];

export interface BusinessProfile {
  legalName: string;
  rcNumber: string;
  taxId: string;
  state: string;
  entityType: "limited_company";
  accountingYearEnd: string;
  turnoverBand: TurnoverBand;
  /**
   * NTA 2025 small-company test is turnover ≤ ₦100m AND total fixed assets
   * ≤ ₦250m. Defaults to false so an unconfirmed profile is taxed at the
   * standard rate — we may overestimate, never understate.
   */
  fixedAssetsUnder250m: boolean;
  vatRegistered: boolean;
  hasEmployees: boolean;
  industry: string;
}

export interface TaxCase {
  id: string;
  businessProfile: BusinessProfile;
  yearStart: string;
  yearEnd: string;
  status: "setup" | "transactions_imported" | "reviewed";
  createdAt: string;
}

export interface ImportedStatementRow {
  date: string;
  description: string;
  counterparty: string;
  debit: number;
  credit: number;
  balance: number;
  sourceAccount: string;
  reference?: string;
  sourceBank?: string;
  originalRowNumber?: number;
  rawSource?: Record<string, string>;
}

export interface Transaction extends ImportedStatementRow {
  id: string;
  caseId: string;
  /** Groups rows that arrived in the same uploaded statement. */
  importId: string;
  category: TransactionCategory;
  confidence: number;
  reviewedByUser: boolean;
  evidenceStatus: EvidenceStatus;
}

export type AmountSide = "debit" | "credit" | "either";

export type TaxRuleTrigger =
  | {
      kind: "transactionCategory";
      categories: TransactionCategory[];
      amountSide: AmountSide;
    }
  | {
      kind: "descriptionKeyword";
      keywords: string[];
      amountSide: AmountSide;
    }
  | {
      kind: "missingEvidenceForCategories";
      categories: TransactionCategory[];
      amountSide: AmountSide;
      acceptableEvidenceStatuses: EvidenceStatus[];
      minimumAmount: number;
    }
  | {
      kind: "duplicateReversalPair";
      sameDay: boolean;
    }
  | {
      kind: "businessProfile";
      turnoverBands: TurnoverBand[];
    };

export type EstimatedImpactMethod =
  | "none"
  | "percentageOfDebit"
  | "percentageOfCredit"
  | "netOfWhtCredit"
  | "vatFractionFromGross";

export interface EstimatedImpactConfig {
  method: EstimatedImpactMethod;
  rate?: number;
  estimateType:
    | "classification_review"
    | "deduction_support_risk"
    | "potential_credit"
    | "evidence_review"
    | "scope_review";
  basis: string;
}

export interface TaxRuleConfig {
  id: string;
  title: string;
  taxArea: string;
  severity: ReviewSeverity;
  triggerDescription: string;
  trigger: TaxRuleTrigger;
  evidenceRequired: string[];
  estimatedImpact: EstimatedImpactConfig;
  enabled: boolean;
}

export interface SourceFact {
  transactionId?: string;
  field: string;
  value: string | number | boolean;
}

export interface EstimatedTaxImpact {
  amount: number;
  currency: "NGN";
  estimateType: EstimatedImpactConfig["estimateType"];
  basis: string;
}

export interface TaxSuggestion {
  id: string;
  caseId: string;
  ruleId: string;
  type: "deterministic_rule";
  severity: ReviewSeverity;
  title: string;
  rationale: string;
  sourceFacts: SourceFact[];
  evidenceRequired: string[];
  confidence: number;
  estimatedTaxImpact: EstimatedTaxImpact;
  status: SuggestionStatus;
  userDecision: UserDecision;
}

export interface TaxPackSummary {
  revenue: number;
  operatingExpenses: number;
  payroll: number;
  capitalAssets: number;
  nonRevenueInflows: number;
  ownerDrawings: number;
  vatCandidateCount: number;
  whtCandidateCount: number;
  payrollRiskCount: number;
  capitalAssetCandidateCount: number;
  missingEvidenceCount: number;
  transactionCount: number;
  projectedTaxPosition: ProjectedTaxPosition;
}

export interface ProjectedTaxPosition {
  taxableProfitEstimate: number;
  /** NTA 2025 class: small (0% CIT, levy-exempt) or standard (30% + 4%). */
  companySize: "small" | "standard";
  estimatedCit: number;
  estimatedDevelopmentLevy: number;
  potentialWhtCredits: number;
  netAmount: number;
  direction: "payable" | "credit" | "neutral";
  rate: number;
  developmentLevyRate: number;
  basis: string;
}

export interface ReviewOutput {
  caseId: string;
  generatedAt: string;
  errors: TaxSuggestion[];
  warnings: TaxSuggestion[];
  suggestions: TaxSuggestion[];
  summary: TaxPackSummary;
}

export interface TaxPack {
  taxCase: TaxCase;
  transactions: Transaction[];
  review: ReviewOutput;
  exportedAt: string;
}
