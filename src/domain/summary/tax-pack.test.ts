import { describe, expect, it } from "vitest";
import { buildTaxPack, summarizeTaxPack } from "@/domain/summary/tax-pack";
import { buildReviewedSeedFixture } from "@/domain/test-fixtures";

describe("tax-pack summary", () => {
  it("calculates deterministic seeded totals under NTA 2025 standard-company rates", () => {
    const { taxCase, transactions, review } = buildReviewedSeedFixture();
    const summary = summarizeTaxPack(transactions, taxCase.businessProfile, [
      ...review.errors,
      ...review.warnings,
      ...review.suggestions
    ]);

    expect(summary.revenue).toBe(24700000);
    expect(summary.operatingExpenses).toBe(3350000);
    expect(summary.payroll).toBe(4200000);
    expect(summary.capitalAssets).toBe(2800000);
    expect(summary.nonRevenueInflows).toBe(5400000);
    expect(summary.ownerDrawings).toBe(1000000);
    expect(summary.whtCandidateCount).toBe(1);
    expect(summary.capitalAssetCandidateCount).toBe(1);
    expect(summary.missingEvidenceCount).toBe(3);
    expect(summary.projectedTaxPosition.taxableProfitEstimate).toBe(17150000);
    expect(summary.projectedTaxPosition.companySize).toBe("standard");
    // 30% CIT
    expect(summary.projectedTaxPosition.estimatedCit).toBe(5145000);
    // 4% Development Levy
    expect(summary.projectedTaxPosition.estimatedDevelopmentLevy).toBe(686000);
    expect(summary.projectedTaxPosition.potentialWhtCredits).toBe(500000);
    // 5,145,000 + 686,000 - 500,000
    expect(summary.projectedTaxPosition.netAmount).toBe(5331000);
    expect(summary.projectedTaxPosition.direction).toBe("payable");
  });

  it("does not use the counterparty field to estimate tax", () => {
    const { taxCase, transactions, review } = buildReviewedSeedFixture();
    const anonymousTransactions = transactions.map((transaction) => ({
      ...transaction,
      counterparty: "Unknown"
    }));
    const summary = summarizeTaxPack(anonymousTransactions, taxCase.businessProfile, [
      ...review.errors,
      ...review.warnings,
      ...review.suggestions
    ]);

    expect(summary.projectedTaxPosition.taxableProfitEstimate).toBe(17150000);
    expect(summary.projectedTaxPosition.estimatedCit).toBe(5145000);
    expect(summary.projectedTaxPosition.estimatedDevelopmentLevy).toBe(686000);
    expect(summary.projectedTaxPosition.potentialWhtCredits).toBe(500000);
    expect(summary.projectedTaxPosition.netAmount).toBe(5331000);
  });

  it("builds exportable tax-pack JSON with the reviewed case", () => {
    const { taxCase, transactions, review } = buildReviewedSeedFixture();
    const taxPack = buildTaxPack(taxCase, transactions, review, "2026-01-31T10:30:00.000Z");

    expect(taxPack.exportedAt).toBe("2026-01-31T10:30:00.000Z");
    expect(taxPack.review.summary.revenue).toBe(24700000);
    expect(taxPack.transactions).toHaveLength(11);
  });
});
