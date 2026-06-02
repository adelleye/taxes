import { describe, expect, it } from "vitest";
import { buildTaxPack, summarizeTaxPack } from "@/domain/summary/tax-pack";
import { buildReviewedSeedFixture } from "@/domain/test-fixtures";

describe("tax-pack summary", () => {
  it("calculates deterministic seeded totals", () => {
    const { transactions, review } = buildReviewedSeedFixture();
    const summary = summarizeTaxPack(transactions, [
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
    expect(summary.projectedTaxPosition.estimatedCit).toBe(5145000);
    expect(summary.projectedTaxPosition.potentialWhtCredits).toBe(500000);
    expect(summary.projectedTaxPosition.netAmount).toBe(4645000);
    expect(summary.projectedTaxPosition.direction).toBe("payable");
  });

  it("builds exportable tax-pack JSON with the reviewed case", () => {
    const { taxCase, transactions, review } = buildReviewedSeedFixture();
    const taxPack = buildTaxPack(taxCase, transactions, review, "2026-01-31T10:30:00.000Z");

    expect(taxPack.exportedAt).toBe("2026-01-31T10:30:00.000Z");
    expect(taxPack.review.summary.revenue).toBe(24700000);
    expect(taxPack.transactions).toHaveLength(11);
  });
});
