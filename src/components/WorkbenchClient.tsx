"use client";

import clsx from "clsx";
import { Check, RefreshCw, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CaseSetupPanel } from "@/components/CaseSetupPanel";
import { CommandSpine } from "@/components/CommandSpine";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ExportActions } from "@/components/ExportActions";
import { ProjectedTaxPositionCard } from "@/components/ProjectedTaxPositionCard";
import { ReviewResults } from "@/components/ReviewResults";
import { TransactionReviewTable } from "@/components/TransactionReviewTable";
import { createSampleTaxCase } from "@/adapters/sample-case";
import { applySuggestionDecision } from "@/domain/review-decisions";
import { ReviewOutputSchema, TaxCaseSchema, TransactionSchema } from "@/domain/schemas";
import { estimateProjectedTaxPosition } from "@/domain/summary/tax-position";
import type {
  BusinessProfile,
  ProjectedTaxPosition,
  ReviewOutput,
  TaxCase,
  TaxSuggestion,
  Transaction,
  UserDecision
} from "@/domain/types";
import { loadWorkspace, saveWorkspace } from "@/lib/workspace-storage";

const SampleCaseResponseSchema = z.object({
  taxCase: TaxCaseSchema,
  transactions: z.array(TransactionSchema)
});

const WORKBENCH_SECTIONS = [
  { id: "company", label: "Company" },
  { id: "transactions", label: "Transactions" },
  { id: "review", label: "What we found" },
  { id: "export", label: "Export pack" }
] as const;

type WorkbenchSectionId = (typeof WORKBENCH_SECTIONS)[number]["id"];

const MATERIAL_EVIDENCE_RULE_ID = "RULE_MISSING_EVIDENCE_MATERIAL_EXPENSE";
const ACCEPTABLE_EVIDENCE_STATUSES = new Set(["available", "uploaded", "not_applicable"]);

export function WorkbenchClient() {
  const sampleCase = useMemo(() => createSampleTaxCase(), []);
  const [profile, setProfile] = useState<BusinessProfile>(sampleCase.businessProfile);
  const [taxCase, setTaxCase] = useState<TaxCase | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [review, setReview] = useState<ReviewOutput | null>(null);
  const [isReviewStale, setIsReviewStale] = useState(false);
  const [focusedTransactionId, setFocusedTransactionId] = useState<string | null>(null);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkbenchSectionId>("company");
  const [error, setError] = useState<string | null>(null);

  const projectedPosition = useMemo(
    () => estimateProjectedTaxPosition(transactions),
    [transactions]
  );
  const blockingCount = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          transaction.debit >= 1000000 &&
          ["operating_expense", "payroll", "capital_asset"].includes(transaction.category) &&
          transaction.evidenceStatus === "none"
      ).length,
    [transactions]
  );
  const warningCount = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          transaction.category === "capital_asset" ||
          transaction.category === "payroll" ||
          (transaction.credit > 0 && transaction.description.toUpperCase().includes("WHT"))
      ).length,
    [transactions]
  );
  const activeBlockingCount = review
    ? review.errors.filter((item) => !isReviewItemCleared(item, transactions)).length
    : blockingCount;
  const activeWarningCount = review
    ? review.warnings.filter((item) => !isReviewItemCleared(item, transactions)).length
    : warningCount;
  const activePosition = review?.summary.projectedTaxPosition ?? projectedPosition;
  const totalReviewItems = review
    ? review.errors.length + review.warnings.length + review.suggestions.length
    : 0;
  const missingEvidenceCount = blockingCount;
  const canExport = Boolean(taxCase && review && activeBlockingCount === 0 && missingEvidenceCount === 0);
  const activeSectionIndex = WORKBENCH_SECTIONS.findIndex((section) => section.id === activeSection);
  const railProgress = ((activeSectionIndex + 1) / WORKBENCH_SECTIONS.length) * 100;
  const saveState = taxCase
    ? ({ label: "All changes saved", tone: "saved" } as const)
    : ({ label: "No case loaded", tone: "idle" } as const);

  useEffect(() => {
    let frame = 0;

    const updateActiveSection = () => {
      const marker = window.scrollY + Math.min(window.innerHeight * 0.34, 260);
      let active: (typeof WORKBENCH_SECTIONS)[number] = WORKBENCH_SECTIONS[0];

      for (const section of WORKBENCH_SECTIONS) {
        const element = document.getElementById(section.id);
        if (!element) {
          continue;
        }

        const sectionTop = element.getBoundingClientRect().top + window.scrollY;
        if (sectionTop > marker) {
          break;
        }

        active = section;
      }

      setActiveSection(active.id);
    };

    const requestUpdate = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateActiveSection();
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  // Rehydrate the last saved workspace so a refresh doesn't drop the user's work.
  // This must run in an effect: localStorage is unavailable during SSR, and a lazy
  // initializer would desync server/client HTML. The mount-time setState is intentional.
  useEffect(() => {
    const saved = loadWorkspace();
    if (!saved) {
      return;
    }

    /* eslint-disable react-hooks/set-state-in-effect */
    setTaxCase(saved.taxCase);
    setProfile(saved.taxCase.businessProfile);
    setTransactions(saved.transactions);
    setReview(saved.review);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persist every change once a case exists, so the "saved" chip tells the truth.
  useEffect(() => {
    if (!taxCase || transactions.length === 0) {
      return;
    }

    saveWorkspace({ taxCase, transactions, review });
  }, [taxCase, transactions, review]);

  const loadSampleCase = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/cases/sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessProfile: profile })
      });
      const payload = SampleCaseResponseSchema.parse(await response.json());
      setTaxCase(payload.taxCase);
      setProfile(payload.taxCase.businessProfile);
      setTransactions(payload.transactions);
      setReview(null);
      setIsReviewStale(false);
      setFocusedTransactionId(null);
      setTransactionSearch("");
    } catch (caughtError) {
      console.error(caughtError);
      setError("We couldn’t load the sample case. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateTransaction = (transactionId: string, patch: Partial<Transaction>) => {
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === transactionId ? { ...transaction, ...patch } : transaction
      )
    );
    setFocusedTransactionId(transactionId);
    if (review) {
      setIsReviewStale(true);
    }
  };

  const updateProfile = (nextProfile: BusinessProfile) => {
    setProfile(nextProfile);
    if (review) {
      setIsReviewStale(true);
    }
  };

  const runReview = async () => {
    if (!taxCase || transactions.length === 0) {
      return;
    }

    setIsReviewing(true);
    setError(null);

    try {
      const caseForReview: TaxCase = {
        ...taxCase,
        businessProfile: profile,
        status: "reviewed"
      };
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taxCase: caseForReview, transactions })
      });
      const review = ReviewOutputSchema.parse(await response.json());
      setTaxCase(caseForReview);
      setReview(review);
      setIsReviewStale(false);
      window.setTimeout(() => {
        document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } catch (caughtError) {
      console.error(caughtError);
      setError("The review couldn’t be completed. Please try again.");
    } finally {
      setIsReviewing(false);
    }
  };

  const updateDecision = (suggestionId: string, userDecision: UserDecision) => {
    if (!taxCase || !review) {
      return;
    }

    const nextReview = applySuggestionDecision(review, suggestionId, userDecision);
    setReview(nextReview);
  };

  const focusTransaction = (transactionId: string) => {
    setFocusedTransactionId(transactionId);
    setTransactionSearch("");
    window.setTimeout(() => {
      document.getElementById("transactions")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const scrollToExport = () => {
    document.getElementById("export")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sidebar = (
    <Sidebar
      sections={WORKBENCH_SECTIONS}
      activeSection={activeSection}
      activeSectionIndex={activeSectionIndex}
      progress={railProgress}
      position={activePosition}
      hasData={transactions.length > 0}
    />
  );

  return (
    <AppShell sidebar={sidebar} saveState={saveState}>
      <CommandSpine
        transactionCount={transactions.length}
        blockingCount={activeBlockingCount}
        warningCount={activeWarningCount}
        missingEvidenceCount={missingEvidenceCount}
        isLoading={isLoading}
        isReviewing={isReviewing}
        canReview={Boolean(taxCase && transactions.length > 0)}
        canExport={canExport}
        hasReview={Boolean(review)}
        onLoadSample={loadSampleCase}
        onReview={runReview}
        onExport={scrollToExport}
      />

      <section className="sec" id="company">
        <div className="sec-head">
          <h1>Company</h1>
          <span className="sec-step">Step 1</span>
        </div>
        <p className="sec-desc">
          Your CAC profile and tax year. These shape the checks — nothing is filed anywhere.
        </p>
        <CaseSetupPanel profile={profile} onProfileChange={updateProfile} />
      </section>

      <section className="sec" id="transactions">
        <div className="sec-head">
          <h3>Transactions</h3>
          <span className="sec-step">Step 2</span>
        </div>
        <p className="sec-desc">
          Each statement row is sorted into a tax category. Confirm the category and evidence before
          you run the review.
        </p>
        <Card>
          {error ? (
            <p className="app-error" role="alert">
              {error}
            </p>
          ) : null}
          <TransactionReviewTable
            transactions={transactions}
            focusedTransactionId={focusedTransactionId}
            searchQuery={transactionSearch}
            onSearchChange={setTransactionSearch}
            onUpdate={updateTransaction}
            onLoadSample={loadSampleCase}
            isLoading={isLoading}
          />
        </Card>
      </section>

      <section className="sec" id="review">
        <div className="sec-head">
          <h3>What we found</h3>
          <span className="sec-step">Step 3</span>
        </div>
        <p className="sec-desc">
          Errors, warnings and savings found in your statement. Open any item to see the transaction
          and the rule behind it.
        </p>

        <div className="results-bar">
          <div className="results-meta">
            <div className="rm-title">Review results</div>
            <div className="rm-sub num">
              {review
                ? `${totalReviewItems} flags · ${activeBlockingCount} must fix${
                    isReviewStale ? " · changes pending rerun" : ""
                  }`
                : "Run the rule engine after loading the sample case."}
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            icon={<RefreshCw size={16} aria-hidden="true" className={isReviewing ? "spin" : undefined} />}
            disabled={!taxCase || transactions.length === 0 || isReviewing}
            onClick={runReview}
          >
            {isReviewing ? "Reviewing…" : review ? "Review and optimize again" : "Review and optimize"}
          </Button>
        </div>

        {isReviewStale ? (
          <p className="stale-note">Results are from the last run. Re-run review before exporting.</p>
        ) : null}

        {review ? (
          <ErrorBoundary
            fallback={
              <div className="empty-state">
                <div>
                  <strong>Couldn’t render the results</strong>
                  <p>Re-run the review to rebuild this view.</p>
                </div>
              </div>
            }
          >
            <ReviewResults
              review={review}
              transactions={transactions}
              onFocusTransaction={focusTransaction}
              onDecisionChange={updateDecision}
            />
          </ErrorBoundary>
        ) : (
          <div className="empty-state">
            <div>
              <strong>No review output yet</strong>
              <p>Load the sample case, confirm classifications, then review and optimize.</p>
            </div>
          </div>
        )}
      </section>

      <section className="sec" id="export">
        <div className="sec-head">
          <h3>Export pack</h3>
          <span className="sec-step">Step 4</span>
        </div>
        <p className="sec-desc">
          When the blocking items are cleared, hand a clean pack to your accountant.
        </p>
        <Card>
          <div className="panel-pad">
            <div className="checklist" role="list">
              <ChecklistItem done={Boolean(taxCase)} label="Company profile complete">
                Name, RC, TIN, year end and tax basis are present.
              </ChecklistItem>
              <ChecklistItem
                done={transactions.length > 0}
                label={`${transactions.length} transactions classified`}
              >
                Every imported row uses a production transaction interface.
              </ChecklistItem>
              <ChecklistItem
                done={missingEvidenceCount === 0}
                label={
                  missingEvidenceCount === 0
                    ? "All expenses have evidence"
                    : `${missingEvidenceCount} expense${
                        missingEvidenceCount === 1 ? "" : "s"
                      } still need evidence`
                }
              >
                Attach receipts or mark evidence not applicable before accountant review.
              </ChecklistItem>
              <ChecklistItem done={Boolean(review)} label="Rule audit trail included">
                Every flag carries rule ID, evidence requirements, status and user decision.
              </ChecklistItem>
            </div>
          </div>
        </Card>

        {taxCase && review ? (
          <ExportActions
            taxCase={taxCase}
            transactions={transactions}
            review={review}
            canExport={canExport}
            blockedLabel="Clear blockers to export"
          />
        ) : (
          <div className="export-grid">
            <div className="ecard">
              <h4>Tax pack</h4>
              <p>Run the review before downloads are enabled.</p>
              <Button type="button" disabled>
                Review and optimize first
              </Button>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function isReviewItemCleared(item: TaxSuggestion, transactions: Transaction[]): boolean {
  if (item.status === "resolved" || item.userDecision === "accepted" || item.userDecision === "rejected") {
    return true;
  }

  if (item.ruleId !== MATERIAL_EVIDENCE_RULE_ID) {
    return false;
  }

  const sourceTransactionIds = item.sourceFacts
    .map((fact) => fact.transactionId)
    .filter((transactionId): transactionId is string => Boolean(transactionId));

  if (sourceTransactionIds.length === 0) {
    return false;
  }

  return sourceTransactionIds.every((transactionId) => {
    const transaction = transactions.find((candidate) => candidate.id === transactionId);
    return transaction ? ACCEPTABLE_EVIDENCE_STATUSES.has(transaction.evidenceStatus) : false;
  });
}

function Sidebar({
  sections,
  activeSection,
  activeSectionIndex,
  progress,
  position,
  hasData
}: {
  sections: ReadonlyArray<{ id: WorkbenchSectionId; label: string }>;
  activeSection: WorkbenchSectionId;
  activeSectionIndex: number;
  progress: number;
  position: ProjectedTaxPosition;
  hasData: boolean;
}) {
  return (
    <>
      <div className="brand">
        <div className="brand-mark">₦</div>
        <div>
          <div className="brand-name">Tax Workbench</div>
          <div className="brand-sub">Nigeria company review</div>
        </div>
      </div>

      <p className="nav-label">Your review</p>
      <nav className="nav">
        {sections.map((section, index) => (
          <a
            key={section.id}
            className={clsx(
              "nav-item",
              section.id === activeSection && "active",
              index < activeSectionIndex && "done"
            )}
            href={`#${section.id}`}
            aria-current={section.id === activeSection ? "true" : undefined}
          >
            <span className="nav-dot">{index + 1}</span>
            {section.label}
          </a>
        ))}
      </nav>

      <div className="progress-wrap">
        <div className="progress" aria-hidden="true">
          <div
            className="progress-fill"
            style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress / 100))})` }}
          />
        </div>
        <p className="progress-text">
          Step {activeSectionIndex + 1} of {sections.length}
        </p>
      </div>

      <ProjectedTaxPositionCard position={position} hasData={hasData} />
    </>
  );
}

function ChecklistItem({
  done,
  label,
  children
}: {
  done: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="cl-row" role="listitem">
      <span className={done ? "cl-icon ok" : "cl-icon no"} aria-hidden="true">
        {done ? <Check strokeWidth={3} /> : <X strokeWidth={3} />}
      </span>
      <div>
        <div className="cl-title">{label}</div>
        <div className="cl-desc">{children}</div>
      </div>
    </div>
  );
}
