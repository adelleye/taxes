"use client";

import {
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  Flag,
  Sparkles,
  TriangleAlert,
  type LucideIcon
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import type {
  ReviewOutput,
  ReviewSeverity,
  TaxSuggestion,
  Transaction,
  UserDecision
} from "@/domain/types";
import { formatMoney, humanizeNarration } from "@/lib/format";

type ReviewFilter = "all" | "error" | "warning" | "suggestion";

const REVIEW_FILTERS: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "error", label: "Must fix" },
  { value: "warning", label: "Worth a look" },
  { value: "suggestion", label: "Savings" }
];

// "needs_review" exists in the domain (and in saved workspaces) but gets no
// button: it pinned the flag open with no visible effect, which read as broken.
const DECISION_ACTIONS: Array<{ value: UserDecision; label: string }> = [
  { value: "accepted", label: "Accept" },
  { value: "rejected", label: "Reject" }
];

const SEVERITY_META: Record<
  ReviewSeverity,
  { cls: string; kicker: string; dot: string; icon: LucideIcon }
> = {
  error: { cls: "err", kicker: "Must fix", dot: "gl-mustfix", icon: Flag },
  warning: { cls: "warn", kicker: "Worth a look", dot: "gl-look", icon: TriangleAlert },
  suggestion: { cls: "suggestion", kicker: "Saving", dot: "gl-save", icon: Sparkles }
};

interface ReviewResultsProps {
  review: ReviewOutput;
  transactions?: Transaction[];
  onFocusTransaction?: (transactionId: string, suggestionId: string) => void;
  onDecisionChange?: (suggestionId: string, userDecision: UserDecision) => void;
}

export function ReviewResults({
  review,
  transactions = [],
  onFocusTransaction,
  onDecisionChange
}: ReviewResultsProps) {
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>("all");
  const transactionById = useMemo(() => {
    const byId = new Map<string, Transaction>();
    for (const transaction of transactions) {
      byId.set(transaction.id, transaction);
    }
    return byId;
  }, [transactions]);
  // Handled flags leave the queue: resolved items stay in the review data
  // (and the exported audit trail) but are not rendered.
  const groups = useMemo(
    () => [
      {
        value: "error" as const,
        severity: "error" as const,
        title: "Must fix",
        openItems: review.errors.filter((item) => item.status === "open")
      },
      {
        value: "warning" as const,
        severity: "warning" as const,
        title: "Worth a look",
        openItems: review.warnings.filter((item) => item.status === "open")
      },
      {
        value: "suggestion" as const,
        severity: "suggestion" as const,
        title: "Savings",
        openItems: review.suggestions.filter((item) => item.status === "open")
      }
    ],
    [review.errors, review.suggestions, review.warnings]
  );
  const counts = {
    all: String(groups.reduce((total, group) => total + group.openItems.length, 0)),
    error: String(groups[0].openItems.length),
    warning: String(groups[1].openItems.length),
    suggestion: String(groups[2].openItems.length)
  };
  const visibleGroups = (
    activeFilter === "all" ? groups : groups.filter((group) => group.value === activeFilter)
  ).filter((group) => group.openItems.length > 0);

  return (
    <div className="review-results">
      <div className="segctl" role="tablist" aria-label="Review result filters">
        {REVIEW_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={activeFilter === filter.value ? "seg active" : "seg"}
            aria-selected={activeFilter === filter.value}
            role="tab"
            onClick={() => setActiveFilter(filter.value)}
          >
            {filter.label}
            <span className="sc num">{counts[filter.value]}</span>
          </button>
        ))}
      </div>

      {visibleGroups.length === 0 ? (
        <div className="empty-state">
          <div>
            <strong>{activeFilter === "all" ? "All flags handled" : "Nothing open here"}</strong>
            <p>
              {activeFilter === "all"
                ? "Every flag has been fixed or decided. The full trail stays in the exported pack."
                : "Every flag in this view has been fixed or decided."}
            </p>
          </div>
        </div>
      ) : (
        visibleGroups.map((group) => (
          <SuggestionGroup
            key={group.value}
            severity={group.severity}
            title={group.title}
            items={group.openItems}
            transactionById={transactionById}
            onFocusTransaction={onFocusTransaction}
            onDecisionChange={onDecisionChange}
          />
        ))
      )}
    </div>
  );
}

function SuggestionGroup({
  severity,
  title,
  items,
  transactionById,
  onFocusTransaction,
  onDecisionChange
}: {
  severity: ReviewSeverity;
  title: string;
  items: TaxSuggestion[];
  transactionById: ReadonlyMap<string, Transaction>;
  onFocusTransaction?: (transactionId: string, suggestionId: string) => void;
  onDecisionChange?: (suggestionId: string, userDecision: UserDecision) => void;
}) {
  return (
    <section className="flag-group">
      <div className="group-label">
        <span className={`gl-dot ${SEVERITY_META[severity].dot}`} />
        {title} · {items.length}
      </div>
      {items.map((item) => (
        <SuggestionRow
          key={item.id}
          item={item}
          transactionById={transactionById}
          onFocusTransaction={onFocusTransaction}
          onDecisionChange={onDecisionChange}
        />
      ))}
    </section>
  );
}

function SuggestionRow({
  item,
  transactionById,
  onFocusTransaction,
  onDecisionChange
}: {
  item: TaxSuggestion;
  transactionById: ReadonlyMap<string, Transaction>;
  onFocusTransaction?: (transactionId: string, suggestionId: string) => void;
  onDecisionChange?: (suggestionId: string, userDecision: UserDecision) => void;
}) {
  const meta = SEVERITY_META[item.severity];
  const BadgeIcon = meta.icon;
  const sourceTransaction = findSourceTransaction(item, transactionById);
  const amount = sourceTransaction
    ? sourceTransaction.credit > 0
      ? sourceTransaction.credit
      : -sourceTransaction.debit
    : null;

  return (
    <article className={`flag ${meta.cls}`} id={`flag-${item.id}`}>
      <div className="flag-pad">
        <div className="flag-top">
          <span className="flag-badge" aria-hidden="true">
            <BadgeIcon />
          </span>
          <div className="flag-head">
            <div className="flag-kicker">{meta.kicker}</div>
            <h4>{item.title}</h4>
            <p className="flag-sub">{item.rationale}</p>
          </div>
        </div>

        {sourceTransaction && amount !== null ? (
          <div className="flag-txn">
            <div>
              <div className="ftxn-l">Transaction</div>
              <div className="ftxn-n">{humanizeNarration(sourceTransaction.description)}</div>
            </div>
            <div className="ftxn-a num">
              {amount < 0 ? <span className="neg">{formatMoney(amount)}</span> : formatMoney(amount)}
            </div>
          </div>
        ) : null}

        {item.evidenceRequired.length > 0 ? (
          <div className="flag-ev">
            <FileText aria-hidden="true" />
            <span>
              <b>Evidence needed:</b> {item.evidenceRequired.join(", ")}.
            </span>
          </div>
        ) : null}

        <div className="flag-actions">
          {onDecisionChange ? (
            <div className="verdict-actions" role="group" aria-label={`Decision for ${item.title}`}>
              {DECISION_ACTIONS.map((decision) => {
                const selected = item.userDecision === decision.value;
                return (
                  <button
                    key={decision.value}
                    type="button"
                    className={[
                      "sbtn",
                      decision.value === "rejected" ? "reject" : "",
                      selected ? `selected-${decision.value}` : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-pressed={selected}
                    onClick={() =>
                      onDecisionChange(item.id, selected ? "pending" : decision.value)
                    }
                  >
                    {decision.value === "accepted" ? (
                      <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                    ) : null}
                    {decision.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="spacer" />
          {sourceTransaction && onFocusTransaction ? (
            <button
              type="button"
              className="flink"
              onClick={() => onFocusTransaction(sourceTransaction.id, item.id)}
            >
              Open transaction
              <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flag-rule" />
      <WhyFlagged item={item} />
    </article>
  );
}

function WhyFlagged({ item }: { item: TaxSuggestion }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const confidencePct = Math.round(item.confidence * 100);

  return (
    <div className="disc">
      <button
        type="button"
        className="disc-t"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="chev">
          <ChevronRight aria-hidden="true" />
        </span>
        Why we flagged this
      </button>
      <div id={panelId} className={open ? "disc-panel open" : "disc-panel"}>
        <div className="disc-panel-inner">
          <div className="disc-body">
            <div className="metrics">
              <div className="metric">
                <div className="m-label">Impact</div>
                <div className="m-value num">{formatMoney(item.estimatedTaxImpact.amount)}</div>
                <div className="m-note">{item.estimatedTaxImpact.basis}</div>
              </div>
              <div className="metric hl">
                <div className="m-label">Confidence</div>
                <div className="m-value num">{confidencePct}%</div>
                <div className="conf-bar">
                  <div className="conf-fill" style={{ ["--conf" as string]: `${confidencePct / 100}` }} />
                </div>
              </div>
              <div className="metric">
                <div className="m-label">Rule ID</div>
                <div className="ruleid">{item.ruleId}</div>
              </div>
            </div>
            {item.sourceFacts.length > 0 ? (
              <dl className="meta">
                {item.sourceFacts.map((fact, index) => (
                  <div className="meta-row" key={`${fact.field}-${index}`}>
                    <dt className="meta-k">{fact.field}</dt>
                    <dd className="meta-v" style={{ margin: 0 }}>
                      {fact.field === "evidenceStatus" ? (
                        <span className="vpill">{String(fact.value)}</span>
                      ) : (
                        String(fact.value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function findSourceTransaction(
  item: TaxSuggestion,
  transactionById: ReadonlyMap<string, Transaction>
): Transaction | undefined {
  for (const fact of item.sourceFacts) {
    if (!fact.transactionId) {
      continue;
    }

    const transaction = transactionById.get(fact.transactionId);
    if (transaction) {
      return transaction;
    }
  }

  return undefined;
}
