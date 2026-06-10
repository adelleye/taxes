import { describe, expect, it } from "vitest";
import { createSampleTaxCase } from "@/adapters/sample-case";
import { applySuggestionDecision, deriveCurrentReview } from "@/domain/review-decisions";
import { loadStaticTaxRules } from "@/domain/rules/rule-store";
import { runReviewEngine } from "@/domain/rules/rule-engine";
import { buildReviewedSeedFixture } from "@/domain/test-fixtures";
import type { TaxSuggestion, Transaction } from "@/domain/types";

describe("applySuggestionDecision", () => {
  it("updates only the selected suggestion decision and status", () => {
    const { review } = buildReviewedSeedFixture();
    const target = review.errors[0];
    const other = review.errors[1];

    const nextReview = applySuggestionDecision(review, target.id, "accepted");

    expect(nextReview.errors[0]).toMatchObject({
      id: target.id,
      userDecision: "accepted",
      status: "resolved"
    });
    expect(nextReview.errors[1]).toMatchObject({
      id: other.id,
      userDecision: "pending",
      status: "open"
    });
  });

  it("marks evidence-cleared review items resolved and recomputes active missing evidence", () => {
    const { taxCase, transactions, review } = buildReviewedSeedFixture();
    const errorTransactionIds = sourceTransactionIds(review.errors);
    const transactionsWithEvidence = markEvidenceAvailable(transactions, errorTransactionIds);

    const currentReview = deriveCurrentReview(review, transactionsWithEvidence, taxCase.businessProfile);

    expect(currentReview.errors).toHaveLength(3);
    expect(currentReview.errors.every((item) => item.status === "resolved")).toBe(true);
    expect(currentReview.errors.every((item) => item.userDecision === "pending")).toBe(true);
    expect(currentReview.summary.missingEvidenceCount).toBe(0);
    expect(currentReview.summary.whtCandidateCount).toBe(review.summary.whtCandidateCount);
    expect(
      currentReview.errors.flatMap((item) => item.sourceFacts).filter((fact) => fact.field === "evidenceStatus")
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "available" }),
        expect.objectContaining({ value: "available" }),
        expect.objectContaining({ value: "available" })
      ])
    );
  });

  it("keeps a user-marked needs-review item open even when evidence is available", () => {
    const { taxCase, transactions, review } = buildReviewedSeedFixture();
    const reviewWithDecision = applySuggestionDecision(review, review.errors[0].id, "needs_review");
    const transactionsWithEvidence = markEvidenceAvailable(
      transactions,
      sourceTransactionIds(reviewWithDecision.errors)
    );

    const currentReview = deriveCurrentReview(reviewWithDecision, transactionsWithEvidence, taxCase.businessProfile);

    expect(currentReview.errors[0]).toMatchObject({
      id: review.errors[0].id,
      status: "open",
      userDecision: "needs_review"
    });
    expect(currentReview.errors.slice(1).every((item) => item.status === "resolved")).toBe(true);
    expect(currentReview.summary.missingEvidenceCount).toBe(1);
  });
});

describe("uncategorized flags", () => {
  it("clears the must-fix flag as soon as the user categorizes the row", () => {
    const taxCase = createSampleTaxCase();
    const mystery = mysteryTransaction();
    const review = runReviewEngine({
      taxCase,
      transactions: [mystery],
      rules: loadStaticTaxRules(),
      generatedAt: "2026-06-10T10:00:00.000Z"
    });

    const flag = review.errors.find((item) => item.ruleId === "RULE_UNCATEGORIZED_EXPENSE");
    expect(flag?.status).toBe("open");

    const categorized: Transaction = { ...mystery, category: "operating_expense", reviewedByUser: true };
    const currentReview = deriveCurrentReview(review, [categorized], taxCase.businessProfile);
    const currentFlag = currentReview.errors.find(
      (item) => item.ruleId === "RULE_UNCATEGORIZED_EXPENSE"
    );

    expect(currentFlag?.status).toBe("resolved");
    expect(currentReview.summary.operatingExpenses).toBe(450000);
  });
});

function mysteryTransaction(): Transaction {
  return {
    id: "mystery-1",
    caseId: "case-nigeria-tax-workbench-sample",
    importId: "import-1",
    date: "2026-02-12",
    description: "OUTWARD TRANSFER (N) 777 TO FIRST BANK | CHUKWU AGENCY /000023",
    counterparty: "Unknown",
    debit: 450000,
    credit: 0,
    balance: 0,
    sourceAccount: "GTB-001",
    raw: {
      date: "2026-02-12",
      description: "OUTWARD TRANSFER (N) 777 TO FIRST BANK | CHUKWU AGENCY /000023",
      counterparty: "Unknown",
      debit: 450000,
      credit: 0,
      balance: 0,
      sourceAccount: "GTB-001"
    },
    category: "uncategorized",
    confidence: 0.45,
    reviewedByUser: false,
    evidenceStatus: "none",
    evidenceIds: []
  };
}

function sourceTransactionIds(items: TaxSuggestion[]) {
  const ids = new Set<string>();

  for (const item of items) {
    for (const fact of item.sourceFacts) {
      if (fact.transactionId) {
        ids.add(fact.transactionId);
      }
    }
  }

  return ids;
}

function markEvidenceAvailable(transactions: Transaction[], transactionIds: Set<string>): Transaction[] {
  return transactions.map((transaction) =>
    transactionIds.has(transaction.id) ? { ...transaction, evidenceStatus: "available" } : transaction
  );
}
