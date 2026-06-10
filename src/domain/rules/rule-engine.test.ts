import { describe, expect, it } from "vitest";
import { createSampleTaxCase } from "@/adapters/sample-case";
import { runReviewEngine } from "@/domain/rules/rule-engine";
import { buildReviewedSeedFixture } from "@/domain/test-fixtures";
import type { TaxRuleConfig, Transaction, TransactionCategory } from "@/domain/types";

describe("runReviewEngine", () => {
  it("fires deterministic rules and emits complete suggestion metadata", () => {
    const { review } = buildReviewedSeedFixture();
    const allSuggestions = [...review.errors, ...review.warnings, ...review.suggestions];

    expect(review.errors.length).toBeGreaterThan(0);
    expect(review.warnings.length).toBeGreaterThan(0);
    expect(review.suggestions.length).toBeGreaterThan(0);
    expect(allSuggestions.map((suggestion) => suggestion.ruleId)).toContain("RULE_WHT_CREDIT_CANDIDATE");
    expect(allSuggestions.map((suggestion) => suggestion.ruleId)).toContain("RULE_PAYE_RISK");
    // Sample case is NGN_300M_1B: standard scope fires, small-company relief must not.
    expect(allSuggestions.map((suggestion) => suggestion.ruleId)).toContain("RULE_STANDARD_COMPANY_SCOPE");
    expect(allSuggestions.map((suggestion) => suggestion.ruleId)).not.toContain("RULE_SMALL_COMPANY_RELIEF");
    expect(allSuggestions.every((suggestion) => suggestion.evidenceRequired.length > 0)).toBe(true);
    expect(allSuggestions.every((suggestion) => suggestion.sourceFacts.length > 0)).toBe(true);
    expect(allSuggestions.every((suggestion) => suggestion.status === "open")).toBe(true);
    expect(allSuggestions.every((suggestion) => suggestion.userDecision === "pending")).toBe(true);
  });

  it("matches duplicate reversal pairs in first-unused credit order", () => {
    const duplicateRule: TaxRuleConfig = {
      id: "RULE_DUPLICATE_REVERSAL_CANDIDATE",
      title: "Possible duplicate or reversal pair",
      taxArea: "Bookkeeping",
      severity: "warning",
      triggerDescription: "Same-day equal debit and credit pair appears to be an error and reversal.",
      trigger: { kind: "duplicateReversalPair", sameDay: true },
      evidenceRequired: ["bank narration trail"],
      estimatedImpact: {
        method: "none",
        estimateType: "classification_review",
        basis: "Reversal pairs should be reviewed."
      },
      enabled: true
    };

    const review = runReviewEngine({
      taxCase: createSampleTaxCase(),
      transactions: [
        transaction("debit-regular", "Regular debit", 1000, 0, "operating_expense"),
        transaction("credit-regular", "Regular credit", 0, 1000, "revenue"),
        transaction("credit-reversal", "Reversal credit", 0, 1000, "reversal"),
        transaction("debit-reversal", "Reversal debit", 1000, 0, "reversal")
      ],
      rules: [duplicateRule],
      generatedAt: "2026-01-31T10:00:00.000Z"
    });

    expect(review.warnings).toHaveLength(2);
    expect(review.warnings.map((suggestion) => suggestion.sourceFacts[0]?.value)).toEqual([
      "Regular debit",
      "Reversal debit"
    ]);
    expect(review.warnings.map((suggestion) => suggestion.sourceFacts[1]?.value)).toEqual([
      "Reversal credit",
      "Regular credit"
    ]);
  });
});

function transaction(
  id: string,
  description: string,
  debit: number,
  credit: number,
  category: TransactionCategory
): Transaction {
  return {
    id,
    caseId: "case-nigeria-tax-workbench-sample",
    importId: "import-1",
    date: "2026-01-15",
    description,
    counterparty: "Counterparty Ltd",
    debit,
    credit,
    balance: 0,
    sourceAccount: "GTB-001",
    raw: {
      date: "2026-01-15",
      description,
      counterparty: "Counterparty Ltd",
      debit,
      credit,
      balance: 0,
      sourceAccount: "GTB-001"
    },
    category,
    confidence: 0.9,
    reviewedByUser: false,
    evidenceStatus: "none",
    evidenceIds: []
  };
}
