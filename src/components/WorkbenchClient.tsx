"use client";

import clsx from "clsx";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CaseSetupPanel } from "@/components/CaseSetupPanel";
import { ChecklistItem } from "@/components/ChecklistItem";
import { CommandSpine } from "@/components/CommandSpine";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ExportActions } from "@/components/ExportActions";
import {
  initialMappingFromPreview,
  MappingPreviewCard,
  type PendingStatementImport
} from "@/components/MappingPreviewCard";
import { ReviewResults } from "@/components/ReviewResults";
import { TransactionReviewTable } from "@/components/TransactionReviewTable";
import { WorkbenchSidebar } from "@/components/WorkbenchSidebar";
import { createCase, EMPTY_PROFILE, isBusinessProfileReady } from "@/domain/case";
import { classifyTransactions } from "@/domain/classification/rule-based-classifier";
import {
  createSavedColumnMapping,
  createImportedTransactions,
  previewBankStatementCsv,
  type ColumnMapping,
  type ImportPreview
} from "@/domain/import/csv";
import { applySuggestionDecision, deriveCurrentReview } from "@/domain/review-decisions";
import { runReviewEngine } from "@/domain/rules/rule-engine";
import { loadStaticTaxRules } from "@/domain/rules/rule-store";
import { TaxCaseSchema, TransactionSchema } from "@/domain/schemas";
import { findSimilarUnreviewedTransactionIds } from "@/domain/classification/category-propagation";
import { estimateProjectedTaxPosition } from "@/domain/summary/tax-position";
import { isMissingMaterialEvidence, looksLikeWhtCredit } from "@/domain/transaction-flags";
import type {
  BusinessProfile,
  ReviewOutput,
  TaxCase,
  Transaction,
  UserDecision
} from "@/domain/types";
import {
  clearWorkspace,
  loadSavedColumnMappings,
  loadWorkspace,
  saveColumnMapping,
  saveWorkspace
} from "@/lib/workspace-storage";

interface Notice {
  kind: "error" | "info";
  text: string;
}

// Transient confirmations (propagation, undo) render as a fixed toast, not an
// inline banner: a banner above the table shifts every row down at the exact
// moment the user is mid-edit, and it lingers until the next notice replaces it.
interface Toast {
  id: number;
  text: string;
  action?: {
    label: string;
    onAction: () => void;
  };
  leaving: boolean;
}

const TOAST_DISMISS_MS = 5000;
const TOAST_WITH_ACTION_DISMISS_MS = 8000;
const TOAST_EXIT_MS = 160;

interface PropagatedRowSnapshot {
  id: string;
  category: Transaction["category"];
  confidence: number;
}

const WORKBENCH_SECTIONS = [
  { id: "company", label: "Company" },
  { id: "transactions", label: "Transactions" },
  { id: "review", label: "What we found" },
  { id: "export", label: "Export pack" }
] as const;

type WorkbenchSectionId = (typeof WORKBENCH_SECTIONS)[number]["id"];

const WARNING_CATEGORIES = new Set<Transaction["category"]>(["capital_asset", "payroll"]);

export function WorkbenchClient() {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<BusinessProfile>(EMPTY_PROFILE);
  const [taxCase, setTaxCase] = useState<TaxCase | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [review, setReview] = useState<ReviewOutput | null>(null);
  const [isReviewStale, setIsReviewStale] = useState(false);
  const [focusedTransactionId, setFocusedTransactionId] = useState<string | null>(null);
  // Set when "Open transaction" jumps to the table; editing that row scrolls
  // back to the flag it came from — or, since fixing a flag removes its card,
  // to the nearest flag that survived. flagIds snapshots the card order at
  // jump time so "nearest" still means something after cards disappear.
  const [reviewJump, setReviewJump] = useState<{
    transactionId: string;
    suggestionId: string;
    flagIds: string[];
  } | null>(null);
  const [pendingReviewReturn, setPendingReviewReturn] = useState<{
    suggestionId: string;
    flagIds: string[];
  } | null>(null);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkbenchSectionId>("company");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef<{ dismiss?: number; remove?: number }>({});
  const [pendingImport, setPendingImport] = useState<PendingStatementImport | null>(null);
  const isProfileComplete = isBusinessProfileReady(profile);

  const projectedPosition = useMemo(
    () => estimateProjectedTaxPosition(transactions, profile),
    [transactions, profile]
  );
  const currentReview = useMemo(
    () => (review ? deriveCurrentReview(review, transactions, profile) : null),
    [review, transactions, profile]
  );
  const { blockingCount, warningCount } = useMemo(() => {
    let blocking = 0;
    let warning = 0;

    for (const transaction of transactions) {
      if (isMissingMaterialEvidence(transaction)) {
        blocking += 1;
      }

      if (WARNING_CATEGORIES.has(transaction.category) || looksLikeWhtCredit(transaction)) {
        warning += 1;
      }
    }

    return { blockingCount: blocking, warningCount: warning };
  }, [transactions]);
  const { activeBlockingCount, activeWarningCount, totalReviewItems } = useMemo(
    () =>
      currentReview
        ? summarizeReviewMetrics(currentReview)
        : {
            activeBlockingCount: blockingCount,
            activeWarningCount: warningCount,
            totalReviewItems: 0
          },
    [blockingCount, currentReview, warningCount]
  );
  const activePosition = currentReview?.summary.projectedTaxPosition ?? projectedPosition;
  const missingEvidenceCount = blockingCount;
  const canExport = Boolean(
    isProfileComplete &&
      taxCase &&
      currentReview &&
      !isReviewStale &&
      activeBlockingCount === 0 &&
      missingEvidenceCount === 0
  );
  const activeSectionIndex = WORKBENCH_SECTIONS.findIndex((section) => section.id === activeSection);
  const railProgress = ((activeSectionIndex + 1) / WORKBENCH_SECTIONS.length) * 100;
  const saveState =
    notice?.kind === "error"
      ? ({ label: "Couldn’t import — nothing changed", tone: "pending" } as const)
      : taxCase && transactions.length > 0
        ? ({ label: "All changes saved", tone: "saved" } as const)
        : ({ label: "No case loaded", tone: "idle" } as const);
  const pendingImportPreview = useMemo(
    () => (pendingImport ? previewBankStatementCsv(pendingImport.csvText, [], pendingImport.mapping) : null),
    [pendingImport]
  );

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

  const clearToastTimers = () => {
    window.clearTimeout(toastTimersRef.current.dismiss);
    window.clearTimeout(toastTimersRef.current.remove);
  };

  const dismissToast = () => {
    clearToastTimers();
    setToast((current) => (current ? { ...current, leaving: true } : current));
    toastTimersRef.current.remove = window.setTimeout(() => setToast(null), TOAST_EXIT_MS);
  };

  const showToast = (text: string, action?: Toast["action"]) => {
    clearToastTimers();
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, text, action, leaving: false });
    toastTimersRef.current.dismiss = window.setTimeout(
      dismissToast,
      action ? TOAST_WITH_ACTION_DISMISS_MS : TOAST_DISMISS_MS
    );
  };

  useEffect(() => clearToastTimers, []);

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

  // Mirror state into storage. Clearing or removing the last statement wipes the
  // saved copy too, so a refresh never resurrects data the user just removed.
  // (loadWorkspace above runs first on mount, so it captures saved data before this.)
  useEffect(() => {
    if (taxCase && transactions.length > 0) {
      saveWorkspace({ taxCase, transactions, review });
    } else {
      clearWorkspace();
    }
  }, [taxCase, transactions, review]);

  const openCsvUpload = () => {
    if (!isProfileComplete) {
      setActiveSection("company");
      document.getElementById("company")?.scrollIntoView({ block: "start" });
      return;
    }

    csvInputRef.current?.click();
  };

  const handleCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    try {
      const csvText = await file.text();
      const preview = previewBankStatementCsv(csvText, loadSavedColumnMappings());

      if (preview.status === "ready") {
        importStatementPreview(preview);
        setPendingImport(null);
        return;
      }

      if (preview.status === "needs_mapping") {
        setPendingImport({
          csvText,
          fileName: file.name,
          preview,
          mapping: initialMappingFromPreview(preview)
        });
        setNotice({
          kind: "info",
          text: preview.message ?? "We could not confidently read this statement. Confirm the column mapping below."
        });
        return;
      }

      setNotice({ kind: "error", text: preview.message ?? "The CSV file could not be parsed." });
    } catch (caughtError) {
      setNotice({ kind: "error", text: formatCsvUploadError(caughtError) });
    } finally {
      setIsLoading(false);
      input.value = "";
    }
  };

  const importStatementPreview = (preview: ImportPreview, confirmedMapping = false) => {
    if (preview.rows.length === 0) {
      setNotice({
        kind: "error",
        text: preview.message ?? "No transaction rows could be read from this statement."
      });
      return;
    }

    // Reuse the existing case so statements accumulate; create one on first import.
    const activeCase = TaxCaseSchema.parse({
      ...(taxCase ?? createCase(profile)),
      businessProfile: profile,
      status: "transactions_imported"
    });
    const importId = crypto.randomUUID();
    const classified = classifyTransactions(
      createImportedTransactions(preview.rows, activeCase.id, importId)
    );
    const importedRows = TransactionSchema.array().parse(classified);

    if (confirmedMapping && preview.mapping && preview.headers.length > 0) {
      saveColumnMapping(createSavedColumnMapping(preview.headers, preview.mapping, preview.metadata.bankName));
    }

    setTaxCase(activeCase);
    setTransactions((current) => [...current, ...importedRows]);
    setReview(null);
    setIsReviewStale(false);
    setNotice({ kind: "info", text: importSummaryNotice(preview) });
  };

  const updatePendingMapping = (patch: Partial<ColumnMapping>) => {
    setPendingImport((current) =>
      current ? { ...current, mapping: { ...current.mapping, ...patch } } : current
    );
  };

  const confirmPendingImport = () => {
    if (!pendingImport) {
      return;
    }

    const preview = previewBankStatementCsv(pendingImport.csvText, [], pendingImport.mapping);

    if (preview.status !== "ready") {
      setPendingImport({ ...pendingImport, preview });
      setNotice({
        kind: "error",
        text: preview.message ?? "The selected columns still do not produce transaction rows."
      });
      return;
    }

    importStatementPreview(preview, true);
    setPendingImport(null);
  };

  const cancelPendingImport = () => {
    setPendingImport(null);
    setNotice(null);
  };

  const removeStatement = (importId: string) => {
    setTransactions((current) => current.filter((transaction) => transaction.importId !== importId));
    setReview(null);
    setIsReviewStale(false);
    setReviewJump(null);
  };

  const clearAll = () => {
    if (!window.confirm("Remove all imported statements and start over? This can’t be undone.")) {
      return;
    }

    setTaxCase(null);
    setTransactions([]);
    setReview(null);
    setIsReviewStale(false);
    setFocusedTransactionId(null);
    setReviewJump(null);
    setTransactionSearch("");
    setNotice(null);
  };

  // Restores the rows a category change fanned out to. Rows the user touched
  // after the fan-out keep their manual decision — undo never outranks a human.
  const undoPropagation = (snapshots: PropagatedRowSnapshot[]) => {
    const priorById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
    setTransactions((current) =>
      current.map((transaction) => {
        const prior = priorById.get(transaction.id);
        return prior && !transaction.reviewedByUser
          ? { ...transaction, category: prior.category, confidence: prior.confidence }
          : transaction;
      })
    );
    showToast(
      `Reverted ${snapshots.length} similar transaction${snapshots.length === 1 ? "" : "s"}. The row you edited kept its category.`
    );
  };

  const updateTransaction = (transactionId: string, patch: Partial<Transaction>) => {
    const edited = transactions.find((transaction) => transaction.id === transactionId);
    if (!edited) {
      return;
    }

    // One categorization teaches the whole statement: unreviewed rows with
    // the same narration fingerprint take the new category too.
    const nextCategory = patch.category;
    const propagateIds =
      nextCategory && nextCategory !== edited.category
        ? new Set(
            findSimilarUnreviewedTransactionIds({ ...edited, ...patch }, transactions, nextCategory)
          )
        : null;

    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === transactionId
          ? { ...transaction, ...patch }
          : nextCategory && propagateIds?.has(transaction.id)
            ? { ...transaction, category: nextCategory, confidence: 0.8 }
            : transaction
      )
    );

    if (propagateIds && propagateIds.size > 0) {
      const snapshots = transactions
        .filter((transaction) => propagateIds.has(transaction.id))
        .map(({ id, category, confidence }) => ({ id, category, confidence }));
      showToast(
        `Also applied to ${snapshots.length} similar transaction${snapshots.length === 1 ? "" : "s"} from the same payee.`,
        { label: "Undo", onAction: () => undoPropagation(snapshots) }
      );
    }

    if (review) {
      setIsReviewStale(true);
    }

    // Close the loop on a flag-initiated edit: editing the row "Open
    // transaction" jumped to returns the user to where that flag was — the
    // card itself if it's still open, otherwise the nearest remaining one.
    // Any other edit means they're working the table now, so the pending
    // return is dropped rather than yanking them later.
    if (reviewJump) {
      const { transactionId: jumpTransactionId, suggestionId, flagIds } = reviewJump;
      setReviewJump(null);
      if (jumpTransactionId === transactionId) {
        setPendingReviewReturn({ suggestionId, flagIds });
      }
    }
  };

  // The return scroll must run AFTER the commit that removed the fixed
  // flag's card — a timeout scheduled in the handler can fire first and
  // scroll to a card that is about to disappear. An effect can't.
  useEffect(() => {
    if (!pendingReviewReturn) {
      return;
    }

    const { suggestionId, flagIds } = pendingReviewReturn;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPendingReviewReturn(null);
    const target =
      document.getElementById(`flag-${suggestionId}`) ??
      findNearestRemainingFlag(flagIds, `flag-${suggestionId}`) ??
      document.getElementById("review");
    target?.scrollIntoView({ block: "start" });
  }, [pendingReviewReturn]);

  const updateProfile = (nextProfile: BusinessProfile) => {
    setProfile(nextProfile);
    if (review) {
      setIsReviewStale(true);
    }
  };

  const runReview = () => {
    if (!taxCase || transactions.length === 0) {
      return;
    }

    setIsReviewing(true);
    setNotice(null);

    try {
      const caseForReview: TaxCase = {
        ...taxCase,
        businessProfile: profile,
        status: "reviewed"
      };
      const review = runReviewEngine({
        taxCase: caseForReview,
        transactions,
        rules: loadStaticTaxRules()
      });
      setTaxCase(caseForReview);
      setReview(review);
      setIsReviewStale(false);
      window.setTimeout(() => {
        document.getElementById("review")?.scrollIntoView({ block: "start" });
      }, 0);
    } catch (caughtError) {
      console.error(caughtError);
      setNotice({ kind: "error", text: "The review couldn’t be completed. Please try again." });
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

  const focusTransaction = (transactionId: string, suggestionId: string) => {
    setFocusedTransactionId(transactionId);
    setReviewJump({
      transactionId,
      suggestionId,
      flagIds: Array.from(document.querySelectorAll(".flag[id]"), (flag) => flag.id)
    });
    setTransactionSearch("");
    window.setTimeout(() => {
      document.getElementById("transactions")?.scrollIntoView({ block: "start" });
    }, 0);
  };

  const scrollToExport = () => {
    document.getElementById("export")?.scrollIntoView({ block: "start" });
  };

  const sidebar = (
    <WorkbenchSidebar
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
      {toast ? (
        <div key={toast.id} className={clsx("toast", toast.leaving && "toast-leaving")} role="status">
          {toast.text}
          {toast.action ? (
            <button type="button" className="toast-action" onClick={toast.action.onAction}>
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={csvInputRef}
        className="sr-only"
        type="file"
        accept=".csv,text/csv"
        aria-label="Upload bank statement CSV"
        data-testid="csv-upload-input"
        onChange={handleCsvUpload}
      />
      <CommandSpine
        transactionCount={transactions.length}
        blockingCount={activeBlockingCount}
        warningCount={activeWarningCount}
        missingEvidenceCount={missingEvidenceCount}
        isLoading={isLoading}
        isReviewing={isReviewing}
        isProfileComplete={isProfileComplete}
        hasPendingChanges={isReviewStale}
        canReview={Boolean(isProfileComplete && taxCase && transactions.length > 0)}
        canExport={canExport}
        hasReview={Boolean(review)}
        onUploadCsv={openCsvUpload}
        onReview={runReview}
        onExport={scrollToExport}
      />

      <section className="sec" id="company">
        <div className="sec-head">
          <h1>Company</h1>
          <span className={clsx("sec-step", !isProfileComplete && "req")}>
            {isProfileComplete ? "Step 1" : "Step 1 — required first"}
          </span>
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
          <NoticeBanner notice={notice} />
          {pendingImport ? (
            <MappingPreviewCard
              pendingImport={pendingImport}
              preview={pendingImportPreview ?? pendingImport.preview}
              onMappingChange={updatePendingMapping}
              onConfirm={confirmPendingImport}
              onCancel={cancelPendingImport}
            />
          ) : null}
          <TransactionReviewTable
            transactions={transactions}
            focusedTransactionId={focusedTransactionId}
            searchQuery={transactionSearch}
            onSearchChange={setTransactionSearch}
            onUpdate={updateTransaction}
            onUploadCsv={openCsvUpload}
            onRemoveStatement={removeStatement}
            onClearAll={clearAll}
            canUploadStatement={isProfileComplete}
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
                ? `${
                    totalReviewItems === 0
                      ? "All flags handled"
                      : `${totalReviewItems} open flag${totalReviewItems === 1 ? "" : "s"} · ${activeBlockingCount} must fix`
                  }${isReviewStale ? " · changes pending rerun" : ""}`
                : "Load a statement to check it for tax issues and opportunities."}
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            icon={<RefreshCw size={16} aria-hidden="true" className={isReviewing ? "spin" : undefined} />}
            disabled={!isProfileComplete || !taxCase || transactions.length === 0 || isReviewing}
            onClick={runReview}
          >
            {isReviewing ? "Reviewing…" : review ? "Review and optimize again" : "Review and optimize"}
          </Button>
        </div>

        {isReviewStale ? (
          <div className="stale-banner" role="alert">
            <TriangleAlert size={17} aria-hidden="true" />
            <p>
              <strong>These results are out of date.</strong> You changed transactions or the
              profile after the last run — re-run the review before exporting the pack.
            </p>
          </div>
        ) : null}

        {currentReview ? (
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
              review={currentReview}
              transactions={transactions}
              onFocusTransaction={focusTransaction}
              onDecisionChange={updateDecision}
            />
          </ErrorBoundary>
        ) : (
          <div className="empty-state">
            <div>
              <strong>No review output yet</strong>
              <p>Load a statement, confirm classifications, then review and optimize.</p>
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
              <ChecklistItem
                status={isProfileComplete ? "complete" : "pending"}
                label={isProfileComplete ? "Company profile complete" : "Company profile needed"}
              >
                Name, RC, TIN, year end and tax basis are present.
              </ChecklistItem>
              <ChecklistItem
                status={transactions.length > 0 ? "complete" : "pending"}
                label={
                  transactions.length > 0
                    ? `${transactions.length} transactions classified`
                    : "No transactions imported"
                }
              >
                Every imported row is included in the review pack.
              </ChecklistItem>
              <ChecklistItem
                status={
                  transactions.length === 0
                    ? "pending"
                    : missingEvidenceCount === 0
                      ? "complete"
                      : "blocked"
                }
                label={
                  transactions.length === 0
                    ? "Evidence review not started"
                    : missingEvidenceCount === 0
                    ? "All expenses have evidence"
                    : `${missingEvidenceCount} expense${
                        missingEvidenceCount === 1 ? "" : "s"
                      } still ${missingEvidenceCount === 1 ? "needs" : "need"} evidence`
                }
              >
                {transactions.length === 0
                  ? "Import transactions before evidence can be checked."
                  : "Attach receipts or mark evidence not applicable before accountant review."}
              </ChecklistItem>
              <ChecklistItem
                status={review && !isReviewStale ? "complete" : "pending"}
                label={
                  review && !isReviewStale
                    ? "Review trail included"
                    : isReviewStale
                      ? "Review needs rerun"
                      : "Review not run yet"
                }
              >
                Every flag carries rule ID, evidence requirements, status and user decision.
              </ChecklistItem>
            </div>
          </div>
        </Card>

        {taxCase && currentReview ? (
          <ExportActions
            taxCase={taxCase}
            transactions={transactions}
            review={currentReview}
            canExport={canExport}
            blockedLabel={isReviewStale ? "Re-run review to export" : "Clear blockers to export"}
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

function formatCsvUploadError(error: unknown): string {
  const detail = error instanceof Error ? error.message : "The file could not be read.";

  return `CSV validation failed. ${detail}`;
}

function importSummaryNotice(preview: ImportPreview): string {
  const parts = [
    `Statement imported: ${preview.reconciliation.transactionCount} transaction${
      preview.reconciliation.transactionCount === 1 ? "" : "s"
    }`,
    `${preview.reconciliation.skippedCount} skipped row${
      preview.reconciliation.skippedCount === 1 ? "" : "s"
    }`
  ];

  if (
    preview.reconciliation.declaredDebitMatches !== undefined ||
    preview.reconciliation.declaredCreditMatches !== undefined
  ) {
    parts.push(
      preview.reconciliation.declaredDebitMatches === false ||
        preview.reconciliation.declaredCreditMatches === false
        ? "totals need review"
        : "totals matched"
    );
  }

  if (preview.reconciliation.balanceWalkPass !== undefined) {
    parts.push(preview.reconciliation.balanceWalkPass ? "balance check passed" : "balance check needs review");
  }

  return `${parts.join(" · ")}.`;
}

function summarizeReviewMetrics(review: ReviewOutput) {
  const activeBlockingCount = countOpenReviewItems(review.errors);
  const activeWarningCount = countOpenReviewItems(review.warnings);

  return {
    activeBlockingCount,
    activeWarningCount,
    totalReviewItems:
      activeBlockingCount + activeWarningCount + countOpenReviewItems(review.suggestions)
  };
}

// Walks the jump-time card order outward from where the fixed flag was:
// first the cards that were below it, then the ones above.
function findNearestRemainingFlag(flagIds: string[], originId: string): HTMLElement | null {
  const originIndex = flagIds.indexOf(originId);
  if (originIndex === -1) {
    return null;
  }

  for (let index = originIndex + 1; index < flagIds.length; index += 1) {
    const flag = document.getElementById(flagIds[index]);
    if (flag) {
      return flag;
    }
  }
  for (let index = originIndex - 1; index >= 0; index -= 1) {
    const flag = document.getElementById(flagIds[index]);
    if (flag) {
      return flag;
    }
  }

  return null;
}

function countOpenReviewItems(items: ReviewOutput["errors"]): number {
  let count = 0;

  for (const item of items) {
    if (item.status === "open") {
      count += 1;
    }
  }

  return count;
}

function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return null;
  }

  return (
    <p
      className={notice.kind === "error" ? "app-error" : "app-notice"}
      role={notice.kind === "error" ? "alert" : "status"}
    >
      {notice.text}
    </p>
  );
}

