import { includesAnyKeyword } from "@/domain/text-match";
import type { Transaction, TransactionCategory } from "@/domain/types";

// Mirrors RULE_MISSING_EVIDENCE_MATERIAL_EXPENSE in src/data/tax-rules.json.
// The table row flag, the export checklist and the review rule must agree on
// which rows block the pack — change the rule and this together.
export const MATERIAL_EVIDENCE_MINIMUM_DEBIT = 1000000;

export const MATERIAL_EVIDENCE_CATEGORIES: ReadonlySet<TransactionCategory> = new Set([
  "operating_expense",
  "payroll",
  "capital_asset"
]);

export function isMissingMaterialEvidence(transaction: Transaction): boolean {
  return (
    transaction.debit >= MATERIAL_EVIDENCE_MINIMUM_DEBIT &&
    MATERIAL_EVIDENCE_CATEGORIES.has(transaction.category) &&
    transaction.evidenceStatus === "none"
  );
}

// Mirrors RULE_WHT_CREDIT_CANDIDATE's keywords so the inferred fallback and
// the fired rule always agree on which receipts look withheld.
export const WHT_KEYWORDS = ["WHT", "WITHHOLDING"];

export function looksLikeWhtCredit(transaction: Transaction): boolean {
  return (
    transaction.credit > 0 && includesAnyKeyword(transaction.description.toUpperCase(), WHT_KEYWORDS)
  );
}
