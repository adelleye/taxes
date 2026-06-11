"use client";

import clsx from "clsx";
import { Check, CircleDashed, RefreshCw, X } from "lucide-react";
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import { createCase, EMPTY_PROFILE, isBusinessProfileReady } from "@/domain/case";
import { RuleBasedClassifier } from "@/domain/classification/rule-based-classifier";
import {
  createSavedColumnMapping,
  createImportedTransactions,
  previewBankStatementCsv,
  type ColumnMapping,
  type ImportAmountMode,
  type ImportPreview
} from "@/domain/import/csv";
import { applySuggestionDecision, deriveCurrentReview } from "@/domain/review-decisions";
import { ReviewOutputSchema, TaxCaseSchema, TransactionSchema } from "@/domain/schemas";
import { findSimilarUnreviewedTransactionIds } from "@/domain/classification/category-propagation";
import { estimateProjectedTaxPosition } from "@/domain/summary/tax-position";
import { isMissingMaterialEvidence, looksLikeWhtCredit } from "@/domain/transaction-flags";
import type {
  BusinessProfile,
  ProjectedTaxPosition,
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

interface PendingStatementImport {
  csvText: string;
  fileName: string;
  preview: ImportPreview;
  mapping: ColumnMapping;
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
  const [transactionSearch, setTransactionSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkbenchSectionId>("company");
  const [notice, setNotice] = useState<Notice | null>(null);
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
      document.getElementById("company")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const classified = new RuleBasedClassifier().classifyBatch(
      createImportedTransactions(preview.rows, activeCase.id, importId),
      profile
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
    setTransactionSearch("");
    setNotice(null);
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
      setNotice({
        kind: "info",
        text: `Applied to ${propagateIds.size} similar transaction${propagateIds.size === 1 ? "" : "s"} with the same payee pattern. Rows you already reviewed were left alone.`
      });
    }

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
    setNotice(null);

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
                ? `${totalReviewItems} flags · ${activeBlockingCount} must fix${
                    isReviewStale ? " · changes pending rerun" : ""
                  }`
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
          <p className="stale-note">Results are from the last run. Re-run review before exporting.</p>
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

function initialMappingFromPreview(preview: ImportPreview): ColumnMapping {
  return (
    preview.mapping ?? {
      date: "",
      description: "",
      debit: "",
      credit: "",
      balance: "",
      counterparty: "",
      sourceAccount: "",
      reference: "",
      dateFormat: "unknown",
      amountMode: "debit_credit_columns"
    }
  );
}

function summarizeReviewMetrics(review: ReviewOutput) {
  return {
    activeBlockingCount: countOpenReviewItems(review.errors),
    activeWarningCount: countOpenReviewItems(review.warnings),
    totalReviewItems: review.errors.length + review.warnings.length + review.suggestions.length
  };
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

function MappingPreviewCard({
  pendingImport,
  preview,
  onMappingChange,
  onConfirm,
  onCancel
}: {
  pendingImport: PendingStatementImport;
  preview: ImportPreview;
  onMappingChange: (patch: Partial<ColumnMapping>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const headers = preview.headers.length > 0 ? preview.headers : pendingImport.preview.headers;
  const mapping = pendingImport.mapping;
  const canConfirm = preview.status === "ready" && preview.rows.length > 0;

  return (
    <div className="mapping-card">
      <div className="mapping-head">
        <div>
          <h4>Confirm statement columns</h4>
          <p>We found a bank statement, but need you to confirm how its columns map to transactions.</p>
        </div>
        <span className="mapping-file">{pendingImport.fileName}</span>
      </div>

      <div className="mapping-grid">
        <MappingSelect
          label="Date column"
          headers={headers}
          value={mapping.date}
          onChange={(date) => onMappingChange({ date })}
        />
        <MappingSelect
          label="Description/narration"
          headers={headers}
          value={mapping.description}
          onChange={(description) => onMappingChange({ description })}
        />
        <label>
          <span className="field-label">Amount mode</span>
          <select
            className="input"
            value={mapping.amountMode}
            onChange={(event) => onMappingChange({ amountMode: event.target.value as ImportAmountMode })}
          >
            <option value="debit_credit_columns">Debit + credit columns</option>
            <option value="signed_amount">Signed amount</option>
            <option value="money_in_money_out">Money in + money out</option>
          </select>
        </label>
        <label>
          <span className="field-label">Date format</span>
          <select
            className="input"
            value={mapping.dateFormat ?? "unknown"}
            onChange={(event) =>
              onMappingChange({ dateFormat: event.target.value as NonNullable<ColumnMapping["dateFormat"]> })
            }
          >
            <option value="unknown">Auto detect</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="DD-MM-YYYY">DD-MM-YYYY</option>
          </select>
        </label>

        {mapping.amountMode === "debit_credit_columns" ? (
          <>
            <MappingSelect
              label="Debit column"
              headers={headers}
              value={mapping.debit ?? ""}
              onChange={(debit) => onMappingChange({ debit })}
            />
            <MappingSelect
              label="Credit column"
              headers={headers}
              value={mapping.credit ?? ""}
              onChange={(credit) => onMappingChange({ credit })}
            />
          </>
        ) : null}

        {mapping.amountMode === "signed_amount" ? (
          <MappingSelect
            label="Amount column"
            headers={headers}
            value={mapping.amount ?? ""}
            onChange={(amount) => onMappingChange({ amount })}
          />
        ) : null}

        {mapping.amountMode === "money_in_money_out" ? (
          <>
            <MappingSelect
              label="Money in column"
              headers={headers}
              value={mapping.moneyIn ?? ""}
              onChange={(moneyIn) => onMappingChange({ moneyIn })}
            />
            <MappingSelect
              label="Money out column"
              headers={headers}
              value={mapping.moneyOut ?? ""}
              onChange={(moneyOut) => onMappingChange({ moneyOut })}
            />
          </>
        ) : null}

        <MappingSelect
          label="Balance column"
          headers={headers}
          value={mapping.balance ?? ""}
          optional
          onChange={(balance) => onMappingChange({ balance: balance || undefined })}
        />
        <MappingSelect
          label="Customer / supplier column"
          headers={headers}
          value={mapping.counterparty ?? ""}
          optional
          onChange={(counterparty) => onMappingChange({ counterparty: counterparty || undefined })}
        />
        <MappingSelect
          label="Reference column"
          headers={headers}
          value={mapping.reference ?? ""}
          optional
          onChange={(reference) => onMappingChange({ reference: reference || undefined })}
        />
      </div>

      <div className="mapping-summary">
        <span>
          {preview.reconciliation.transactionCount} rows detected · {preview.reconciliation.skippedCount} row
          {preview.reconciliation.skippedCount === 1 ? "" : "s"} skipped
        </span>
        {preview.message ? <span>{preview.message}</span> : null}
      </div>

      <div className="mapping-preview">
        {preview.previewRows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="right">Amount</th>
                <th className="right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {preview.previewRows.map((row) => (
                <tr key={`${row.originalRowNumber}-${row.date}-${row.description}`}>
                  <td className="num">{row.date}</td>
                  <td>{row.description}</td>
                  <td className={row.debit > 0 ? "right neg num" : "right num"}>
                    {formatImportAmount(row.credit > 0 ? row.credit : -row.debit)}
                  </td>
                  <td className="right num">{row.balance ? formatImportAmount(row.balance) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mapping-empty">No preview rows yet.</div>
        )}
      </div>

      {preview.rowIssues.length > 0 ? (
        <ul className="mapping-issues">
          {preview.rowIssues.slice(0, 4).map((issue) => (
            <li key={`${issue.rowNumber}-${issue.message}`}>
              Row {issue.rowNumber}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mapping-actions">
        <Button type="button" variant="primary" disabled={!canConfirm} onClick={onConfirm}>
          Import statement
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function MappingSelect({
  label,
  headers,
  value,
  onChange,
  optional = false
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{optional ? "Not mapped" : "Choose column"}</option>
        {headers.map((header) =>
          header ? (
            <option key={header} value={header}>
              {header}
            </option>
          ) : null
        )}
      </select>
    </label>
  );
}

function formatImportAmount(value: number): string {
  return `₦${Math.abs(value).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
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

type ChecklistStatus = "complete" | "blocked" | "pending";

function ChecklistItem({
  status,
  label,
  children
}: {
  status: ChecklistStatus;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="cl-row" role="listitem">
      <span
        className={clsx(
          "cl-icon",
          status === "complete" && "ok",
          status === "blocked" && "no",
          status === "pending" && "pending"
        )}
        aria-hidden="true"
      >
        {status === "complete" ? (
          <Check strokeWidth={3} />
        ) : status === "blocked" ? (
          <X strokeWidth={3} />
        ) : (
          <CircleDashed strokeWidth={2.4} />
        )}
      </span>
      <div>
        <div className="cl-title">{label}</div>
        <div className="cl-desc">{children}</div>
      </div>
    </div>
  );
}
