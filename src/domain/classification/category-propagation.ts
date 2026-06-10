import type { Transaction, TransactionCategory } from "@/domain/types";

/**
 * Stable fingerprint for "rows that are the same kind of payment".
 * Digit runs collapse to "#" so references, dates and session ids don't
 * split a group, and punctuation collapses so "zenith/ sky" and
 * "zenith/sky" agree. Payee names survive, so different payees with the
 * same narration shape stay separate groups.
 */
export function narrationSignature(
  transaction: Pick<Transaction, "description" | "counterparty">
): string {
  return `${transaction.description} ${transaction.counterparty}`
    .toUpperCase()
    .replace(/\d+/g, "#")
    .replace(/[^A-Z#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * When the user categorizes one row, every unreviewed row with the same
 * narration fingerprint on the same money side can take the same category.
 * Rows the user already touched are never overwritten — a human decision
 * outranks a propagated one.
 */
export function findSimilarUnreviewedTransactionIds(
  edited: Transaction,
  transactions: Transaction[],
  category: TransactionCategory
): string[] {
  const signature = narrationSignature(edited);
  const editedSide = edited.debit > 0 ? "debit" : "credit";
  const ids: string[] = [];

  for (const candidate of transactions) {
    if (
      candidate.id === edited.id ||
      candidate.reviewedByUser ||
      candidate.category === category
    ) {
      continue;
    }

    const candidateSide = candidate.debit > 0 ? "debit" : "credit";
    if (candidateSide === editedSide && narrationSignature(candidate) === signature) {
      ids.push(candidate.id);
    }
  }

  return ids;
}
