import type { ReviewOutput, TaxSuggestion, UserDecision } from "@/domain/types";

export function applySuggestionDecision(
  review: ReviewOutput,
  suggestionId: string,
  userDecision: UserDecision
): ReviewOutput {
  const status: TaxSuggestion["status"] =
    userDecision === "accepted" || userDecision === "rejected" ? "resolved" : "open";

  const updateGroup = (items: TaxSuggestion[]) =>
    items.map((item) =>
      item.id === suggestionId
        ? {
            ...item,
            userDecision,
            status
          }
        : item
    );

  return {
    ...review,
    errors: updateGroup(review.errors),
    warnings: updateGroup(review.warnings),
    suggestions: updateGroup(review.suggestions)
  };
}
