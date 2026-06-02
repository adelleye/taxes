import { describe, expect, it } from "vitest";
import { applySuggestionDecision } from "@/domain/review-decisions";
import { buildReviewedSeedFixture } from "@/domain/test-fixtures";

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
});
