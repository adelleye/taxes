import { Download, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { StatementImportActions } from "@/components/StatementImportActions";

interface CommandSpineProps {
  transactionCount: number;
  blockingCount: number;
  warningCount: number;
  missingEvidenceCount: number;
  isLoading?: boolean;
  isReviewing?: boolean;
  isProfileComplete: boolean;
  hasPendingChanges?: boolean;
  canReview: boolean;
  canExport: boolean;
  hasReview?: boolean;
  onUploadCsv: () => void;
  onReview: () => void;
  onExport: () => void;
}

type HeroActionKind = "none" | "upload" | "button";

interface HeroState {
  title: string;
  copy: string;
  button: string;
  icon: ReactNode;
  disabled: boolean;
  action?: () => void;
  actionKind: HeroActionKind;
}

export function CommandSpine({
  transactionCount,
  blockingCount,
  warningCount,
  missingEvidenceCount,
  isLoading = false,
  isReviewing = false,
  isProfileComplete,
  hasPendingChanges = false,
  canReview,
  canExport,
  hasReview = false,
  onUploadCsv,
  onReview,
  onExport
}: CommandSpineProps) {
  const evidenceLabel = `${missingEvidenceCount} item${missingEvidenceCount === 1 ? "" : "s"} ${
    missingEvidenceCount === 1 ? "needs" : "need"
  } evidence`;
  const isImportStep = transactionCount === 0;
  const reviewIcon = (
    <RefreshCw size={16} aria-hidden="true" className={isReviewing ? "spin" : undefined} />
  );
  let hero: HeroState;

  if (!isProfileComplete) {
    hero = {
      title: "Complete company profile",
      copy:
        "Enter the registered name, CAC/RC number and TIN so the statement review uses the right company context.",
      button: "",
      icon: null,
      disabled: true,
      actionKind: "none"
    };
  } else if (isImportStep) {
    hero = {
      title: "Start with a bank statement",
      copy:
        "Upload the CSV version of your bank statement. If your bank provides Excel or PDF, export it to CSV before importing.",
      button: "",
      icon: null,
      disabled: false,
      actionKind: "upload"
    };
  } else if (!hasReview) {
    hero = {
      title: "Review your transactions",
      copy:
        missingEvidenceCount > 0
          ? `Your bank statement is loaded and sorted. ${evidenceLabel} before this pack is ready for your accountant.`
          : "Your bank statement is loaded and sorted. Check the categories, then run the review.",
      button: isReviewing ? "Reviewing…" : "Review and optimize",
      icon: reviewIcon,
      disabled: !canReview || isReviewing,
      action: onReview,
      actionKind: "button"
    };
  } else if (hasPendingChanges) {
    hero = {
      title: "Re-run review before download",
      copy:
        "You changed the profile or transactions after the last review. Re-run it so the export uses the current classifications and evidence.",
      button: isReviewing ? "Reviewing…" : "Review and optimize",
      icon: reviewIcon,
      disabled: !canReview || isReviewing,
      action: onReview,
      actionKind: "button"
    };
  } else if (canExport) {
    hero = {
      title: "Download your pack",
      copy:
        "The profile, transaction summary, review decisions and audit trail are ready for your accountant.",
      button: "Go to export pack",
      icon: <Download size={16} aria-hidden="true" />,
      disabled: false,
      action: onExport,
      actionKind: "button"
    };
  } else {
    hero = {
      title: blockingCount > 0 || missingEvidenceCount > 0 ? "Clear blockers to download" : "Review final warnings",
      copy: buildBlockedCopy(blockingCount, missingEvidenceCount, warningCount, evidenceLabel),
      button: isReviewing ? "Reviewing…" : "Review and optimize",
      icon: reviewIcon,
      disabled: !canReview || isReviewing,
      action: onReview,
      actionKind: "button"
    };
  }

  return (
    <section className="banner reveal" aria-labelledby="next-step-title">
      <div>
        <p className="banner-kicker">Next step</p>
        <h2 id="next-step-title">{hero.title}</h2>
        <p>{hero.copy}</p>
      </div>
      {hero.actionKind === "upload" ? (
        <StatementImportActions
          className="banner-import-actions"
          isLoading={isLoading}
          onUploadCsv={onUploadCsv}
          label="Upload bank statement"
        />
      ) : hero.actionKind === "button" ? (
        <Button
          type="button"
          variant="primary"
          className="banner-cta"
          icon={hero.icon}
          disabled={hero.disabled}
          onClick={hero.action}
        >
          {hero.button}
        </Button>
      ) : null}
    </section>
  );
}

function buildBlockedCopy(
  blockingCount: number,
  missingEvidenceCount: number,
  warningCount: number,
  evidenceLabel: string
) {
  if (blockingCount > 0 && missingEvidenceCount > 0) {
    return `Download is blocked by ${blockingCount} must-fix review item${
      blockingCount === 1 ? "" : "s"
    } and ${evidenceLabel} in the transactions table. Decisions update this pack immediately.`;
  }

  if (blockingCount > 0) {
    return `Download is blocked by ${blockingCount} must-fix review item${
      blockingCount === 1 ? "" : "s"
    }. Decisions update this pack immediately.`;
  }

  if (missingEvidenceCount > 0) {
    return `Download is blocked because ${evidenceLabel} in the transactions table.`;
  }

  return `${warningCount} item${
    warningCount === 1 ? "" : "s"
  } ${warningCount === 1 ? "is" : "are"} still worth a look before download.`;
}
