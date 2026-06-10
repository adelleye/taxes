import type { Transaction } from "@/domain/types";

export interface StatementSummary {
  importId: string;
  /** Distinct source accounts in the batch — usually one bank/account. */
  sourceAccounts: string[];
  count: number;
  startDate: string;
  endDate: string;
}

interface StatementAccumulator extends StatementSummary {
  sourceAccountSet: Set<string>;
}

/**
 * Groups transactions into the statements they were imported from. Pure and
 * order-preserving so the UI and a future server query stay in agreement.
 */
export function summarizeStatements(transactions: Transaction[]): StatementSummary[] {
  const groups = new Map<string, StatementAccumulator>();

  for (const transaction of transactions) {
    let summary = groups.get(transaction.importId);

    if (!summary) {
      summary = {
        importId: transaction.importId,
        sourceAccounts: [],
        sourceAccountSet: new Set(),
        count: 0,
        startDate: transaction.date,
        endDate: transaction.date
      };
      groups.set(transaction.importId, summary);
    }

    summary.count += 1;
    if (transaction.date < summary.startDate) {
      summary.startDate = transaction.date;
    }
    if (transaction.date > summary.endDate) {
      summary.endDate = transaction.date;
    }
    if (!summary.sourceAccountSet.has(transaction.sourceAccount)) {
      summary.sourceAccountSet.add(transaction.sourceAccount);
      summary.sourceAccounts.push(transaction.sourceAccount);
    }
  }

  return Array.from(groups.values(), (summary) => ({
    importId: summary.importId,
    sourceAccounts: summary.sourceAccounts,
    count: summary.count,
    startDate: summary.startDate,
    endDate: summary.endDate
  }));
}
