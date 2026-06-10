import { summarizeTaxPack } from "@/domain/summary/tax-pack";
import type {
  BusinessProfile,
  ReviewOutput,
  SourceFact,
  TaxSuggestion,
  Transaction,
  UserDecision
} from "@/domain/types";

const MISSING_EVIDENCE_RULE_ID = "RULE_MISSING_EVIDENCE_MATERIAL_EXPENSE";
const UNCATEGORIZED_RULE_ID = "RULE_UNCATEGORIZED_EXPENSE";
const ACCEPTABLE_EVIDENCE_STATUSES = new Set<Transaction["evidenceStatus"]>([
  "available",
  "uploaded",
  "not_applicable"
]);

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

export function deriveCurrentReview(
  review: ReviewOutput,
  transactions: Transaction[],
  profile: BusinessProfile
): ReviewOutput {
  const transactionById = new Map<string, Transaction>();
  for (const transaction of transactions) {
    transactionById.set(transaction.id, transaction);
  }

  const errors = review.errors.map((item) => syncReviewItemWithTransactions(item, transactionById));
  const warnings = review.warnings.map((item) => syncReviewItemWithTransactions(item, transactionById));
  const suggestions = review.suggestions.map((item) => syncReviewItemWithTransactions(item, transactionById));
  const summary = summarizeTaxPack(transactions, profile, [...errors, ...warnings, ...suggestions]);

  return {
    ...review,
    errors,
    warnings,
    suggestions,
    summary: {
      ...summary,
      missingEvidenceCount: countOpenRule(errors, MISSING_EVIDENCE_RULE_ID)
    }
  };
}

export function isReviewItemClearedByCurrentState(
  item: TaxSuggestion,
  transactionById: ReadonlyMap<string, Transaction>
): boolean {
  if (item.status === "resolved" || item.userDecision === "accepted" || item.userDecision === "rejected") {
    return true;
  }

  if (item.userDecision === "needs_review") {
    return false;
  }

  // An "uncategorized" flag exists to make the user pick a category — the
  // moment every source row has one, the flag has done its job and clears.
  if (item.ruleId === UNCATEGORIZED_RULE_ID) {
    return everySourceTransactionIsCategorized(item, transactionById);
  }

  return hasAcceptableEvidenceForEverySourceTransaction(item, transactionById);
}

function everySourceTransactionIsCategorized(
  item: TaxSuggestion,
  transactionById: ReadonlyMap<string, Transaction>
): boolean {
  let sawSourceTransaction = false;

  for (const fact of item.sourceFacts) {
    if (!fact.transactionId) {
      continue;
    }

    const transaction = transactionById.get(fact.transactionId);
    if (!transaction || transaction.category === "uncategorized") {
      return false;
    }

    sawSourceTransaction = true;
  }

  return sawSourceTransaction;
}

function syncReviewItemWithTransactions(
  item: TaxSuggestion,
  transactionById: ReadonlyMap<string, Transaction>
): TaxSuggestion {
  const sourceFacts = item.sourceFacts.map((fact) => syncSourceFactWithTransaction(fact, transactionById));
  const status = isReviewItemClearedByCurrentState(item, transactionById) ? "resolved" : "open";

  if (item.status === status && sourceFacts.every((fact, index) => fact === item.sourceFacts[index])) {
    return item;
  }

  return {
    ...item,
    sourceFacts,
    status
  };
}

function syncSourceFactWithTransaction(
  fact: SourceFact,
  transactionById: ReadonlyMap<string, Transaction>
): SourceFact {
  if (!fact.transactionId) {
    return fact;
  }

  const transaction = transactionById.get(fact.transactionId);
  if (!transaction) {
    return fact;
  }

  const currentValue = currentSourceFactValue(fact.field, transaction);
  return currentValue === undefined || currentValue === fact.value ? fact : { ...fact, value: currentValue };
}

function currentSourceFactValue(field: string, transaction: Transaction) {
  switch (field) {
    case "category":
      return transaction.category;
    case "description":
    case "debitTransaction":
    case "creditTransaction":
      return transaction.description;
    case "evidenceStatus":
      return transaction.evidenceStatus;
    case "amount":
      return transaction.debit > 0 ? transaction.debit : transaction.credit;
    case "credit":
      return transaction.credit;
    default:
      return undefined;
  }
}

function hasAcceptableEvidenceForEverySourceTransaction(
  item: TaxSuggestion,
  transactionById: ReadonlyMap<string, Transaction>
): boolean {
  const checkedTransactionIds = new Set<string>();

  for (const fact of item.sourceFacts) {
    if (!fact.transactionId || checkedTransactionIds.has(fact.transactionId)) {
      continue;
    }

    checkedTransactionIds.add(fact.transactionId);
    const transaction = transactionById.get(fact.transactionId);
    if (!transaction || !ACCEPTABLE_EVIDENCE_STATUSES.has(transaction.evidenceStatus)) {
      return false;
    }
  }

  return checkedTransactionIds.size > 0;
}

function countOpenRule(items: TaxSuggestion[], ruleId: string): number {
  let count = 0;

  for (const item of items) {
    if (item.ruleId === ruleId && item.status === "open") {
      count += 1;
    }
  }

  return count;
}
