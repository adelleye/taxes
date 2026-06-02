import { z } from "zod";
import {
  EVIDENCE_STATUSES,
  REVIEW_SEVERITIES,
  SUGGESTION_STATUSES,
  TRANSACTION_CATEGORIES,
  TURNOVER_BANDS,
  USER_DECISIONS
} from "./types";

export const AmountNumberSchema = z.number().finite().nonnegative();

export const ImportedStatementRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  counterparty: z.string().min(1),
  debit: AmountNumberSchema,
  credit: AmountNumberSchema,
  balance: z.number().finite(),
  sourceAccount: z.string().min(1)
});

export const BusinessProfileSchema = z.object({
  legalName: z.string().min(1),
  rcNumber: z.string().min(1),
  taxId: z.string().min(1),
  state: z.string().min(1),
  entityType: z.literal("limited_company"),
  accountingYearEnd: z.string().regex(/^\d{2}-\d{2}$/),
  turnoverBand: z.enum(TURNOVER_BANDS),
  vatRegistered: z.boolean(),
  hasEmployees: z.boolean(),
  industry: z.string().min(1)
});

export const TaxCaseSchema = z.object({
  id: z.string().min(1),
  businessProfile: BusinessProfileSchema,
  yearStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  yearEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["setup", "transactions_imported", "reviewed"]),
  createdAt: z.string().datetime()
});

export const TransactionSchema = ImportedStatementRowSchema.extend({
  id: z.string().min(1),
  caseId: z.string().min(1),
  raw: ImportedStatementRowSchema,
  category: z.enum(TRANSACTION_CATEGORIES),
  confidence: z.number().min(0).max(1),
  reviewedByUser: z.boolean(),
  evidenceStatus: z.enum(EVIDENCE_STATUSES),
  evidenceIds: z.array(z.string())
});

const TransactionTriggerSchema = z.object({
  kind: z.literal("transactionCategory"),
  categories: z.array(z.enum(TRANSACTION_CATEGORIES)).min(1),
  amountSide: z.enum(["debit", "credit", "either"])
});

const KeywordTriggerSchema = z.object({
  kind: z.literal("descriptionKeyword"),
  keywords: z.array(z.string().min(1)).min(1),
  amountSide: z.enum(["debit", "credit", "either"])
});

const MissingEvidenceTriggerSchema = z.object({
  kind: z.literal("missingEvidenceForCategories"),
  categories: z.array(z.enum(TRANSACTION_CATEGORIES)).min(1),
  amountSide: z.enum(["debit", "credit", "either"]),
  acceptableEvidenceStatuses: z.array(z.enum(EVIDENCE_STATUSES)).min(1),
  minimumAmount: AmountNumberSchema
});

const DuplicateReversalTriggerSchema = z.object({
  kind: z.literal("duplicateReversalPair"),
  sameDay: z.boolean()
});

const BusinessProfileTriggerSchema = z.object({
  kind: z.literal("businessProfile"),
  turnoverBands: z.array(z.enum(TURNOVER_BANDS)).min(1)
});

export const TaxRuleTriggerSchema = z.discriminatedUnion("kind", [
  TransactionTriggerSchema,
  KeywordTriggerSchema,
  MissingEvidenceTriggerSchema,
  DuplicateReversalTriggerSchema,
  BusinessProfileTriggerSchema
]);

export const EstimatedImpactConfigSchema = z.object({
  method: z.enum([
    "none",
    "percentageOfDebit",
    "percentageOfCredit",
    "netOfWhtCredit",
    "vatFractionFromGross"
  ]),
  rate: z.number().finite().nonnegative().optional(),
  estimateType: z.enum([
    "classification_review",
    "deduction_support_risk",
    "potential_credit",
    "evidence_review",
    "scope_review"
  ]),
  basis: z.string().min(1)
});

export const TaxRuleConfigSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  taxArea: z.string().min(1),
  severity: z.enum(REVIEW_SEVERITIES),
  triggerDescription: z.string().min(1),
  trigger: TaxRuleTriggerSchema,
  evidenceRequired: z.array(z.string().min(1)).min(1),
  estimatedImpact: EstimatedImpactConfigSchema,
  enabled: z.boolean()
});

export const SourceFactSchema = z.object({
  transactionId: z.string().optional(),
  field: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()])
});

export const EstimatedTaxImpactSchema = z.object({
  amount: AmountNumberSchema,
  currency: z.literal("NGN"),
  estimateType: EstimatedImpactConfigSchema.shape.estimateType,
  basis: z.string().min(1)
});

export const TaxSuggestionSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  ruleId: z.string().min(1),
  type: z.literal("deterministic_rule"),
  severity: z.enum(REVIEW_SEVERITIES),
  title: z.string().min(1),
  rationale: z.string().min(1),
  sourceFacts: z.array(SourceFactSchema).min(1),
  evidenceRequired: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  estimatedTaxImpact: EstimatedTaxImpactSchema,
  status: z.enum(SUGGESTION_STATUSES),
  userDecision: z.enum(USER_DECISIONS)
});

export const TaxPackSummarySchema = z.object({
  revenue: AmountNumberSchema,
  operatingExpenses: AmountNumberSchema,
  payroll: AmountNumberSchema,
  capitalAssets: AmountNumberSchema,
  nonRevenueInflows: AmountNumberSchema,
  ownerDrawings: AmountNumberSchema,
  vatCandidateCount: z.number().int().nonnegative(),
  whtCandidateCount: z.number().int().nonnegative(),
  payrollRiskCount: z.number().int().nonnegative(),
  capitalAssetCandidateCount: z.number().int().nonnegative(),
  missingEvidenceCount: z.number().int().nonnegative(),
  transactionCount: z.number().int().nonnegative(),
  projectedTaxPosition: z.object({
    taxableProfitEstimate: AmountNumberSchema,
    estimatedCit: AmountNumberSchema,
    potentialWhtCredits: AmountNumberSchema,
    netAmount: z.number().finite(),
    direction: z.enum(["payable", "credit", "neutral"]),
    rate: z.number().finite().nonnegative(),
    basis: z.string().min(1)
  })
});

export const ReviewOutputSchema = z.object({
  caseId: z.string().min(1),
  generatedAt: z.string().datetime(),
  errors: z.array(TaxSuggestionSchema),
  warnings: z.array(TaxSuggestionSchema),
  suggestions: z.array(TaxSuggestionSchema),
  summary: TaxPackSummarySchema
});

export const ReviewRequestSchema = z.object({
  taxCase: TaxCaseSchema,
  transactions: z.array(TransactionSchema).min(1)
});

export const TaxPackSchema = z.object({
  taxCase: TaxCaseSchema,
  transactions: z.array(TransactionSchema),
  review: ReviewOutputSchema,
  exportedAt: z.string().datetime()
});

export const TaxRuleConfigListSchema = z.array(TaxRuleConfigSchema).min(1);
