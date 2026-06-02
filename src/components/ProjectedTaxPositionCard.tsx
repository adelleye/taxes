import type { ProjectedTaxPosition } from "@/domain/types";
import { InfoHint } from "@/components/ui/InfoHint";
import { formatMoney } from "@/lib/format";

interface ProjectedTaxPositionCardProps {
  position: ProjectedTaxPosition;
  /** False before any statement is loaded — we show a prompt instead of a hollow ₦0. */
  hasData?: boolean;
}

export function ProjectedTaxPositionCard({ position, hasData = true }: ProjectedTaxPositionCardProps) {
  const heading =
    position.direction === "credit"
      ? "Estimated refund"
      : position.direction === "neutral"
        ? "Estimated tax"
        : "Estimated tax to set aside";

  const note =
    position.direction === "credit"
      ? "You may be owed money back."
      : position.direction === "neutral"
        ? "Nothing due yet on what’s sorted."
        : "A guide for what to put aside.";

  return (
    <section className="tax-card">
      <div className="tax-top">
        <span className="tax-label">{heading}</span>
        <InfoHint
          label="How this estimate is calculated"
          title="How we estimate this"
          className="tax-info"
          side="bottom"
        >
          <p className="info-lead">
            A rough guide from the transactions you&rsquo;ve sorted so far — not a tax filing or advice.
          </p>
          <dl className="info-breakdown">
            <div>
              <dt>Taxable profit</dt>
              <dd className="num">{formatMoney(position.taxableProfitEstimate)}</dd>
            </div>
            <div>
              <dt>Company tax at {Math.round(position.rate * 100)}%</dt>
              <dd className="num">{formatMoney(position.estimatedCit)}</dd>
            </div>
            <div>
              <dt>Tax already withheld (WHT)</dt>
              <dd className="num">&minus;{formatMoney(position.potentialWhtCredits)}</dd>
            </div>
          </dl>
          <p className="info-foot">
            Capital purchases aren&rsquo;t deducted here. Your accountant confirms the final figure.
          </p>
        </InfoHint>
      </div>

      {hasData ? (
        <strong className="tax-value num">{formatMoney(Math.abs(position.netAmount))}</strong>
      ) : (
        <span className="tax-empty">Load a statement to estimate</span>
      )}

      <p className="tax-note">{hasData ? note : "We’ll work this out from your transactions."}</p>
    </section>
  );
}
