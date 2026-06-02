import { describe, expect, it } from "vitest";
import { buildReviewedSeedFixture } from "@/domain/test-fixtures";

describe("runReviewEngine", () => {
  it("fires deterministic rules and emits complete suggestion metadata", () => {
    const { review } = buildReviewedSeedFixture();
    const allSuggestions = [...review.errors, ...review.warnings, ...review.suggestions];

    expect(review.errors.length).toBeGreaterThan(0);
    expect(review.warnings.length).toBeGreaterThan(0);
    expect(review.suggestions.length).toBeGreaterThan(0);
    expect(allSuggestions.map((suggestion) => suggestion.ruleId)).toContain("RULE_WHT_CREDIT_CANDIDATE");
    expect(allSuggestions.map((suggestion) => suggestion.ruleId)).toContain("RULE_PAYE_RISK");
    expect(allSuggestions.every((suggestion) => suggestion.evidenceRequired.length > 0)).toBe(true);
    expect(allSuggestions.every((suggestion) => suggestion.sourceFacts.length > 0)).toBe(true);
    expect(allSuggestions.every((suggestion) => suggestion.status === "open")).toBe(true);
    expect(allSuggestions.every((suggestion) => suggestion.userDecision === "pending")).toBe(true);
  });
});
