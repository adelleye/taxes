import { Download, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/Button";

interface CommandSpineProps {
  transactionCount: number;
  blockingCount: number;
  warningCount: number;
  missingEvidenceCount: number;
  isLoading?: boolean;
  isReviewing?: boolean;
  canReview: boolean;
  canExport: boolean;
  hasReview?: boolean;
  onLoadSample: () => void;
  onReview: () => void;
  onExport: () => void;
}

export function CommandSpine({
  transactionCount,
  blockingCount,
  warningCount,
  missingEvidenceCount,
  isLoading = false,
  isReviewing = false,
  canReview,
  canExport,
  hasReview = false,
  onLoadSample,
  onReview,
  onExport
}: CommandSpineProps) {
  const evidenceLabel = `${missingEvidenceCount} item${missingEvidenceCount === 1 ? "" : "s"} need evidence`;
  const hero =
    transactionCount === 0
      ? {
          title: "Upload your bank statement",
          copy:
            "Start with the sample statement for now. We will sort each row into tax-ready categories before review.",
          button: isLoading ? "Loading statement…" : "Load sample statement",
          icon: <Upload size={16} aria-hidden="true" />,
          disabled: isLoading,
          action: onLoadSample
        }
      : !hasReview
        ? {
            title: "Review your transactions",
            copy:
              missingEvidenceCount > 0
                ? `Your bank statement is loaded and sorted. ${evidenceLabel} before this pack is ready for your accountant.`
                : "Your bank statement is loaded and sorted. Check the categories, then run the review.",
            button: isReviewing ? "Reviewing…" : "Review and optimize",
            icon: <RefreshCw size={16} aria-hidden="true" className={isReviewing ? "spin" : undefined} />,
            disabled: !canReview || isReviewing,
            action: onReview
          }
        : canExport
          ? {
              title: "Download your pack",
              copy:
                "The profile, transaction summary, review decisions and audit trail are ready for your accountant.",
              button: "Go to export pack",
              icon: <Download size={16} aria-hidden="true" />,
              disabled: false,
              action: onExport
            }
          : {
              title:
                missingEvidenceCount > 0
                  ? `Add evidence for ${missingEvidenceCount} item${
                      missingEvidenceCount === 1 ? "" : "s"
                    }`
                  : `Clear ${blockingCount} blocker${blockingCount === 1 ? "" : "s"}`,
              copy:
                blockingCount > 0 && missingEvidenceCount > 0
                  ? `${blockingCount} must-fix review item${
                      blockingCount === 1 ? "" : "s"
                    } remain, and ${evidenceLabel} in the transactions table. Decisions update this pack immediately.`
                  : blockingCount > 0
                    ? `${blockingCount} must-fix review item${
                        blockingCount === 1 ? "" : "s"
                      } remain. Decisions update this pack immediately.`
                  : `${warningCount} item${
                      warningCount === 1 ? "" : "s"
                    } are still worth a look before download.`,
              button: isReviewing ? "Reviewing…" : "Review and optimize",
              icon: <RefreshCw size={16} aria-hidden="true" className={isReviewing ? "spin" : undefined} />,
              disabled: !canReview || isReviewing,
              action: onReview
            };

  return (
    <section className="banner reveal" aria-labelledby="next-step-title">
      <div>
        <p className="banner-kicker">Next step</p>
        <h2 id="next-step-title">{hero.title}</h2>
        <p>{hero.copy}</p>
      </div>
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
    </section>
  );
}
