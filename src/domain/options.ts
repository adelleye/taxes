import {
  EVIDENCE_STATUSES,
  TRANSACTION_CATEGORIES,
  TURNOVER_BANDS,
  USER_DECISIONS
} from "@/domain/types";
import type { EvidenceStatus, TransactionCategory, TurnoverBand, UserDecision } from "@/domain/types";

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  revenue: "Revenue",
  director_funding: "Director funding",
  operating_expense: "Operating expense",
  payroll: "Payroll",
  capital_asset: "Capital asset",
  owner_drawings: "Owner drawings",
  reversal: "Reversal",
  tax_payment: "Tax payment",
  uncategorized: "Uncategorized"
};

export const EVIDENCE_LABELS: Record<EvidenceStatus, string> = {
  none: "No evidence",
  available: "Available",
  uploaded: "Uploaded",
  not_applicable: "Not applicable"
};

export const USER_DECISION_LABELS: Record<UserDecision, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  needs_review: "Needs review"
};

export const TURNOVER_LABELS: Record<TurnoverBand, string> = {
  NGN_0_25M: "NGN 0-25m",
  NGN_25M_100M: "NGN 25m-100m",
  NGN_100M_300M: "NGN 100m-300m",
  NGN_300M_1B: "NGN 300m-1b",
  NGN_1B_PLUS: "NGN 1b+"
};

/**
 * Plain-language explanations for users without a finance background.
 * Each one answers "when do I pick this?" — not what an accountant calls it.
 */
export const CATEGORY_DESCRIPTIONS: Record<TransactionCategory, string> = {
  revenue: "Money customers paid you for what you sell",
  director_funding: "The owner/director put their own money in — not sales, not taxed",
  operating_expense: "Day-to-day costs: rent, fees, software, contractors, fuel",
  payroll: "Salaries and pensions for your employees",
  capital_asset: "Things you'll use for years: laptops, vehicles, machines",
  owner_drawings: "The owner took money out for personal use — not a business cost",
  reversal: "A failed or returned transfer that came back",
  tax_payment: "Your own taxes paid to FIRS/LIRS (CIT, VAT, PAYE remittance)",
  uncategorized: "We couldn't tell what this is — please pick one"
};

export const CATEGORY_OPTIONS = TRANSACTION_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
  description: CATEGORY_DESCRIPTIONS[value]
}));

export const EVIDENCE_STATUS_OPTIONS = EVIDENCE_STATUSES.map((value) => ({
  value,
  label: EVIDENCE_LABELS[value]
}));

export const USER_DECISION_OPTIONS = USER_DECISIONS.map((value) => ({
  value,
  label: USER_DECISION_LABELS[value]
}));

export const TURNOVER_OPTIONS = TURNOVER_BANDS.map((value) => ({
  value,
  label: TURNOVER_LABELS[value]
}));
