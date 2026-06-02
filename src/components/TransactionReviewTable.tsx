"use client";

import { Search, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Select, type SelectOption } from "@/components/ui/Select";
import type { EvidenceStatus, Transaction, TransactionCategory } from "@/domain/types";
import { CATEGORY_OPTIONS, EVIDENCE_STATUS_OPTIONS } from "@/domain/options";
import { formatMoney, humanizeNarration } from "@/lib/format";

const CATEGORY_FILTER_OPTIONS: ReadonlyArray<SelectOption<TransactionCategory | "all">> = [
  { value: "all", label: "All categories" },
  ...CATEGORY_OPTIONS
];

const EVIDENCE_FILTER_OPTIONS: ReadonlyArray<SelectOption<EvidenceStatus | "all">> = [
  { value: "all", label: "All evidence" },
  ...EVIDENCE_STATUS_OPTIONS
];

interface TransactionReviewTableProps {
  transactions: Transaction[];
  focusedTransactionId?: string | null;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onUpdate: (transactionId: string, patch: Partial<Transaction>) => void;
  onLoadSample?: () => void;
  isLoading?: boolean;
}

export function TransactionReviewTable({
  transactions,
  focusedTransactionId,
  searchQuery,
  onSearchChange,
  onUpdate,
  onLoadSample,
  isLoading = false
}: TransactionReviewTableProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<TransactionCategory | "all">("all");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceStatus | "all">("all");
  const effectiveSearchQuery = searchQuery ?? localSearchQuery;
  const reviewedCount = transactions.filter((transaction) => transaction.reviewedByUser).length;

  const visibleTransactions = useMemo(
    () =>
      transactions.filter((transaction) =>
        matchesFilters(transaction, effectiveSearchQuery, categoryFilter, evidenceFilter)
      ),
    [categoryFilter, effectiveSearchQuery, evidenceFilter, transactions]
  );

  useEffect(() => {
    if (!focusedTransactionId) {
      return;
    }

    window.setTimeout(() => {
      document
        .getElementById(`transaction-${focusedTransactionId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }, 0);
  }, [focusedTransactionId, visibleTransactions.length]);

  const updateSearchQuery = (nextQuery: string) => {
    if (onSearchChange) {
      onSearchChange(nextQuery);
      return;
    }

    setLocalSearchQuery(nextQuery);
  };

  if (transactions.length === 0) {
    return (
      <div className="panel-pad">
        <div className="empty-state">
          <div>
            <strong>No transactions loaded</strong>
            <p>Load the sample statement to import the seed bank rows and start the review.</p>
            {onLoadSample ? (
              <Button
                variant="primary"
                icon={<Upload size={16} aria-hidden="true" />}
                onClick={onLoadSample}
                disabled={isLoading}
                style={{ marginTop: 18 }}
              >
                {isLoading ? "Loading statement…" : "Load sample statement"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="table-head-strip">
        <div>
          <div className="ts-title">Bank statement</div>
          <div className="ts-sub num">
            {transactions.length} imported transactions · {reviewedCount} user-reviewed
          </div>
        </div>
        <div className="filters">
          <label className="search">
            <span className="sr-only">Search transactions</span>
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              inputMode="search"
              value={effectiveSearchQuery}
              onChange={(event) => updateSearchQuery(event.target.value)}
              placeholder="Search transactions"
              autoComplete="off"
              spellCheck={false}
            />
            {effectiveSearchQuery ? (
              <button
                className="search-clear"
                type="button"
                onClick={() => updateSearchQuery("")}
                aria-label="Clear transaction search"
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <Select
            className="mini-select"
            ariaLabel="Filter by transaction category"
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            items={CATEGORY_FILTER_OPTIONS}
          />
          <Select
            className="mini-select"
            ariaLabel="Filter by evidence status"
            value={evidenceFilter}
            onValueChange={setEvidenceFilter}
            items={EVIDENCE_FILTER_OPTIONS}
          />
          <span className="count-pill num">
            {visibleTransactions.length} / {transactions.length}
          </span>
        </div>
      </div>

      {visibleTransactions.length === 0 ? (
        <div style={{ margin: "8px 30px 28px" }}>
          <div className="empty-state">
            <div>
              <strong>No matching transactions</strong>
              <p>Adjust the search or filters.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Counterparty</th>
                <th className="right">Amount</th>
                <th>Category</th>
                <th>Evidence</th>
                <th className="right">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((transaction) => (
                <tr
                  id={`transaction-${transaction.id}`}
                  key={transaction.id}
                  className={rowClassName(transaction, focusedTransactionId)}
                >
                  <td className="t-date num">{transaction.date}</td>
                  <td>
                    <div className="t-desc" title={transaction.description}>
                      {humanizeNarration(transaction.description)}
                    </div>
                    <div className="t-ref">{transaction.sourceAccount}</div>
                  </td>
                  <td>{transaction.counterparty}</td>
                  <td className={transaction.debit > 0 ? "t-amt neg num" : "t-amt num"}>
                    {formatMoney(transaction.credit > 0 ? transaction.credit : -transaction.debit)}
                  </td>
                  <td>
                    <Select
                      className="select-cat"
                      ariaLabel={`Category for ${transaction.description}`}
                      value={transaction.category}
                      onValueChange={(value) =>
                        onUpdate(transaction.id, { category: value, reviewedByUser: true })
                      }
                      items={CATEGORY_OPTIONS}
                      startSlot={
                        <span
                          className={`dot dot-${categoryTone(transaction.category)}`}
                          aria-hidden="true"
                        />
                      }
                    />
                  </td>
                  <td>
                    <Select
                      className="select-ev"
                      ariaLabel={`Evidence status for ${transaction.description}`}
                      value={transaction.evidenceStatus}
                      onValueChange={(value) =>
                        onUpdate(transaction.id, { evidenceStatus: value, reviewedByUser: true })
                      }
                      items={EVIDENCE_STATUS_OPTIONS}
                    />
                  </td>
                  <td className="status">
                    <Flag transaction={transaction} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="legend">
        <span>
          <span className="lz" style={{ background: "var(--cyan)" }} />
          Reviewed by user
        </span>
        <span>
          <span className="lz" style={{ background: "var(--flag)" }} />
          Evidence missing
        </span>
        <span>
          <span className="lz" style={{ background: "var(--warn)" }} />
          Material item
        </span>
      </div>
      <p className="table-foot">
        Sample import source: /seed/sample-statement.csv · Runtime review uses JSON rules only.
      </p>
    </>
  );
}

type RowSeverity = "err" | "warn" | null;

function rowSeverity(transaction: Transaction): RowSeverity {
  if (
    transaction.debit >= 1000000 &&
    ["operating_expense", "payroll", "capital_asset"].includes(transaction.category) &&
    transaction.evidenceStatus === "none"
  ) {
    return "err";
  }

  if (transaction.evidenceStatus === "none" && transaction.debit > 0) {
    return "warn";
  }

  return null;
}

function rowClassName(transaction: Transaction, focusedTransactionId?: string | null): string {
  const classes: string[] = [];

  if (transaction.id === focusedTransactionId) {
    classes.push("focused");
  }

  const severity = rowSeverity(transaction);
  if (severity === "err") {
    classes.push("row-flag-err");
  } else if (severity === "warn") {
    classes.push("row-flag-warn");
  }

  return classes.join(" ");
}

function categoryTone(category: TransactionCategory): string {
  switch (category) {
    case "revenue":
      return "rev";
    case "director_funding":
      return "dir";
    case "operating_expense":
    case "tax_payment":
      return "op";
    case "payroll":
      return "pay";
    case "capital_asset":
      return "cap";
    case "reversal":
      return "reversal";
    case "owner_drawings":
      return "own";
    case "uncategorized":
      return "neutral";
  }
}

function Flag({ transaction }: { transaction: Transaction }) {
  if (transaction.reviewedByUser) {
    return (
      <span className="tag tag-ok">
        <span className="tg" />
        Reviewed
      </span>
    );
  }

  const severity = rowSeverity(transaction);

  if (severity === "err") {
    return (
      <span className="tag tag-action">
        <span className="tg" />
        Action
      </span>
    );
  }

  if (severity === "warn") {
    return (
      <span className="tag tag-review">
        <span className="tg" />
        Review
      </span>
    );
  }

  return <span className="pct num">{Math.round(transaction.confidence * 100)}%</span>;
}

function matchesFilters(
  transaction: Transaction,
  searchQuery: string,
  categoryFilter: TransactionCategory | "all",
  evidenceFilter: EvidenceStatus | "all"
) {
  if (categoryFilter !== "all" && transaction.category !== categoryFilter) {
    return false;
  }

  if (evidenceFilter !== "all" && transaction.evidenceStatus !== evidenceFilter) {
    return false;
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    transaction.id,
    transaction.date,
    transaction.description,
    transaction.counterparty,
    transaction.sourceAccount,
    transaction.category,
    transaction.evidenceStatus,
    String(transaction.debit),
    String(transaction.credit)
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}
