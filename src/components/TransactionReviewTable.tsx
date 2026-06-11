"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatementImportActions } from "@/components/StatementImportActions";
import { StatementManager } from "@/components/StatementManager";
import { InfoHint } from "@/components/ui/InfoHint";
import { Select, type SelectOption } from "@/components/ui/Select";
import type { EvidenceStatus, Transaction, TransactionCategory } from "@/domain/types";
import { CATEGORY_OPTIONS, EVIDENCE_STATUS_OPTIONS } from "@/domain/options";
import { isMissingMaterialEvidence } from "@/domain/transaction-flags";
import { formatMoney, humanizeNarration } from "@/lib/format";

const CATEGORY_FILTER_OPTIONS: ReadonlyArray<SelectOption<TransactionCategory | "all">> = [
  { value: "all", label: "All categories" },
  ...CATEGORY_OPTIONS
];

const EVIDENCE_FILTER_OPTIONS: ReadonlyArray<SelectOption<EvidenceStatus | "all">> = [
  { value: "all", label: "All evidence" },
  ...EVIDENCE_STATUS_OPTIONS
];

const TRANSACTION_PAGE_SIZE = 50;
// Below this, nobody attaches an invoice (₦50 NIP fees, stamp duty) — a
// "Review" nag on hundreds of micro-debits buries the rows that matter.
const REVIEW_TAG_MINIMUM_DEBIT = 10000;

interface TransactionReviewTableProps {
  transactions: Transaction[];
  focusedTransactionId?: string | null;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onUpdate: (transactionId: string, patch: Partial<Transaction>) => void;
  onUploadCsv: () => void;
  onRemoveStatement: (importId: string) => void;
  onClearAll: () => void;
  canUploadStatement?: boolean;
  isLoading?: boolean;
}

export function TransactionReviewTable({
  transactions,
  focusedTransactionId,
  searchQuery,
  onSearchChange,
  onUpdate,
  onUploadCsv,
  onRemoveStatement,
  onClearAll,
  canUploadStatement = true,
  isLoading = false
}: TransactionReviewTableProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<TransactionCategory | "all">("all");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceStatus | "all">("all");
  const [needsEvidenceOnly, setNeedsEvidenceOnly] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const effectiveSearchQuery = searchQuery ?? localSearchQuery;
  const normalizedSearchQuery = effectiveSearchQuery.trim().toLowerCase();
  const { reviewedCount, needsEvidenceCount, visibleTransactionIndexById, visibleTransactions } =
    useMemo(() => {
      let reviewed = 0;
      let needsEvidence = 0;
      const visible: Transaction[] = [];
      const indexById = new Map<string, number>();

      for (const transaction of transactions) {
        if (transaction.reviewedByUser) {
          reviewed += 1;
        }

        if (isMissingMaterialEvidence(transaction)) {
          needsEvidence += 1;
        }

        if (
          matchesFilters(transaction, normalizedSearchQuery, categoryFilter, evidenceFilter) &&
          (!needsEvidenceOnly || isMissingMaterialEvidence(transaction))
        ) {
          indexById.set(transaction.id, visible.length);
          visible.push(transaction);
        }
      }

      return {
        reviewedCount: reviewed,
        needsEvidenceCount: needsEvidence,
        visibleTransactionIndexById: indexById,
        visibleTransactions: visible
      };
    }, [categoryFilter, evidenceFilter, needsEvidenceOnly, normalizedSearchQuery, transactions]);
  const pageCount = Math.max(1, Math.ceil(visibleTransactions.length / TRANSACTION_PAGE_SIZE));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pagedTransactions = useMemo(() => {
    const start = currentPageIndex * TRANSACTION_PAGE_SIZE;
    return visibleTransactions.slice(start, start + TRANSACTION_PAGE_SIZE);
  }, [currentPageIndex, visibleTransactions]);
  const showingStart =
    visibleTransactions.length === 0 ? 0 : currentPageIndex * TRANSACTION_PAGE_SIZE + 1;
  const showingEnd = Math.min(
    visibleTransactions.length,
    (currentPageIndex + 1) * TRANSACTION_PAGE_SIZE
  );

  // Jump to a newly focused transaction ONCE, then let go. Without the
  // handled-ref, this effect re-fires on every page change and drags the
  // user back to the focused row's page — "Next" becomes unclickable.
  const lastHandledFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedTransactionId || focusedTransactionId === lastHandledFocusRef.current) {
      return;
    }

    const targetIndex = visibleTransactionIndexById.get(focusedTransactionId);
    if (targetIndex === undefined) {
      return;
    }

    const nextPageIndex = Math.floor(targetIndex / TRANSACTION_PAGE_SIZE);
    if (nextPageIndex !== currentPageIndex) {
      window.setTimeout(() => setPageIndex(nextPageIndex), 0);
      return;
    }

    lastHandledFocusRef.current = focusedTransactionId;
    window.setTimeout(() => {
      document
        .getElementById(`transaction-${focusedTransactionId}`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, 0);
  }, [currentPageIndex, focusedTransactionId, visibleTransactionIndexById]);

  const updateSearchQuery = (nextQuery: string) => {
    setPageIndex(0);
    if (onSearchChange) {
      onSearchChange(nextQuery);
      return;
    }

    setLocalSearchQuery(nextQuery);
  };

  const updateCategoryFilter = (nextCategory: TransactionCategory | "all") => {
    setPageIndex(0);
    setCategoryFilter(nextCategory);
  };

  const updateEvidenceFilter = (nextEvidenceStatus: EvidenceStatus | "all") => {
    setPageIndex(0);
    setEvidenceFilter(nextEvidenceStatus);
  };

  const toggleNeedsEvidenceOnly = () => {
    setPageIndex(0);
    setNeedsEvidenceOnly((current) => !current);
  };

  if (transactions.length === 0) {
    return (
      <div className="panel-pad">
        <div className="empty-state">
          <div>
            <strong>{canUploadStatement ? "No transactions loaded" : "Complete company profile first"}</strong>
            <p>
              {canUploadStatement
                ? "Upload a bank-statement CSV to start. You can add more statements afterwards."
                : "Enter the registered name, CAC/RC number and TIN before uploading a statement."}
            </p>
            {canUploadStatement ? (
              <StatementImportActions
                className="empty-import-actions"
                isLoading={isLoading}
                onUploadCsv={onUploadCsv}
              />
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
            onValueChange={updateCategoryFilter}
            items={CATEGORY_FILTER_OPTIONS}
          />
          <Select
            className="mini-select"
            ariaLabel="Filter by evidence status"
            value={evidenceFilter}
            onValueChange={updateEvidenceFilter}
            items={EVIDENCE_FILTER_OPTIONS}
          />
          {needsEvidenceCount > 0 || needsEvidenceOnly ? (
            <button
              type="button"
              className="filter-toggle"
              aria-pressed={needsEvidenceOnly}
              onClick={toggleNeedsEvidenceOnly}
            >
              <span className="tg" aria-hidden="true" />
              Needs evidence{needsEvidenceCount > 0 ? ` · ${needsEvidenceCount}` : ""}
            </button>
          ) : null}
          <span className="count-pill num">
            {visibleTransactions.length} / {transactions.length}
          </span>
        </div>
      </div>
      <div className="statement-tools">
        <StatementManager
          transactions={transactions}
          isLoading={isLoading}
          onUploadCsv={onUploadCsv}
          onRemoveStatement={onRemoveStatement}
          onClearAll={onClearAll}
        />
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
                <th>
                  <span className="th-help">
                    Customer / supplier
                    <InfoHint label="What customer or supplier means" title="Customer or supplier">
                      <p>
                        The other person or business on this bank line. Some banks do not provide it
                        separately, so we use the narration instead.
                      </p>
                    </InfoHint>
                  </span>
                </th>
                <th className="right">Amount</th>
                <th>Category</th>
                <th>Evidence</th>
                <th className="right">Status</th>
              </tr>
            </thead>
            <tbody>
              {pagedTransactions.map((transaction) => (
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
                  <td className={isUnknownCounterparty(transaction.counterparty) ? "muted-cell" : undefined}>
                    {formatCounterparty(transaction.counterparty)}
                  </td>
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

      {pageCount > 1 ? (
        <div className="table-pager" aria-label="Transaction pages">
          <span className="pager-range num">
            Showing {showingStart}-{showingEnd} of {visibleTransactions.length}
          </span>
          <div className="pager-actions">
            <button
              type="button"
              className="pager-btn"
              disabled={currentPageIndex === 0}
              onClick={() => setPageIndex(Math.max(0, currentPageIndex - 1))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Previous
            </button>
            <span className="pager-page num">
              {currentPageIndex + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="pager-btn"
              disabled={currentPageIndex >= pageCount - 1}
              onClick={() => setPageIndex(Math.min(pageCount - 1, currentPageIndex + 1))}
            >
              Next
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

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
        Imports normalize CSV bank statements into date, description, debit, credit, balance
        and source-account fields. Checks use configured tax rules.
      </p>
    </>
  );
}

type RowSeverity = "err" | "warn" | null;

function rowSeverity(transaction: Transaction): RowSeverity {
  if (isMissingMaterialEvidence(transaction)) {
    return "err";
  }

  if (transaction.evidenceStatus === "none" && transaction.debit >= REVIEW_TAG_MINIMUM_DEBIT) {
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

function formatCounterparty(counterparty: string): string {
  return isUnknownCounterparty(counterparty) ? "Not shown by bank" : counterparty;
}

function isUnknownCounterparty(counterparty: string): boolean {
  return counterparty.trim().toLowerCase() === "unknown";
}

function matchesFilters(
  transaction: Transaction,
  normalizedQuery: string,
  categoryFilter: TransactionCategory | "all",
  evidenceFilter: EvidenceStatus | "all"
) {
  if (categoryFilter !== "all" && transaction.category !== categoryFilter) {
    return false;
  }

  if (evidenceFilter !== "all" && transaction.evidenceStatus !== evidenceFilter) {
    return false;
  }

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
