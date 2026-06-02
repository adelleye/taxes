import { describe, expect, it } from "vitest";
import { buildReviewedSeedFixture } from "@/domain/test-fixtures";

describe("RuleBasedClassifier", () => {
  it("classifies seeded transactions into production categories", () => {
    const { transactions } = buildReviewedSeedFixture();

    expect(transactions.map((transaction) => transaction.category)).toEqual([
      "revenue",
      "director_funding",
      "revenue",
      "operating_expense",
      "operating_expense",
      "payroll",
      "revenue",
      "capital_asset",
      "reversal",
      "reversal",
      "owner_drawings"
    ]);
  });
});
