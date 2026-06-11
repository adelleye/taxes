import { describe, expect, it } from "vitest";
import { loadStaticTaxRules } from "@/domain/rules/rule-store";
import {
  MATERIAL_EVIDENCE_CATEGORIES,
  MATERIAL_EVIDENCE_MINIMUM_DEBIT,
  WHT_KEYWORDS,
  isMissingMaterialEvidence,
  looksLikeWhtCredit
} from "@/domain/transaction-flags";
import { EVIDENCE_STATUSES } from "@/domain/types";
import type { Transaction } from "@/domain/types";

describe("isMissingMaterialEvidence", () => {
  it("flags a material expense with no evidence at the threshold", () => {
    expect(isMissingMaterialEvidence(transaction({ debit: 1_000_000 }))).toBe(true);
  });

  it("ignores debits below the threshold", () => {
    expect(isMissingMaterialEvidence(transaction({ debit: 999_999 }))).toBe(false);
  });

  it("ignores non-material categories", () => {
    expect(isMissingMaterialEvidence(transaction({ category: "owner_drawings" }))).toBe(false);
  });

  it("ignores rows that have evidence", () => {
    expect(isMissingMaterialEvidence(transaction({ evidenceStatus: "available" }))).toBe(false);
    expect(isMissingMaterialEvidence(transaction({ evidenceStatus: "not_applicable" }))).toBe(false);
  });
});

describe("looksLikeWhtCredit", () => {
  it("matches WHT keywords on credits, case-insensitively", () => {
    expect(
      looksLikeWhtCredit(
        transaction({ debit: 0, credit: 95_000, description: "Invoice 19 wht net" })
      )
    ).toBe(true);
  });

  it("ignores debit rows even when the narration mentions WHT", () => {
    expect(looksLikeWhtCredit(transaction({ description: "WHT REMITTANCE TO FIRS" }))).toBe(false);
  });

  it("ignores credits with unrelated narrations", () => {
    expect(looksLikeWhtCredit(transaction({ debit: 0, credit: 95_000 }))).toBe(false);
  });
});

// These predicates mirror rules that live in tax-rules.json (rules stay in
// JSON by design, and JSON cannot import code). This suite is what keeps the
// two sides from drifting: change the rule and transaction-flags.ts together.
describe("sync with tax-rules.json", () => {
  const rules = loadStaticTaxRules();

  it("matches RULE_MISSING_EVIDENCE_MATERIAL_EXPENSE", () => {
    const rule = rules.find((candidate) => candidate.id === "RULE_MISSING_EVIDENCE_MATERIAL_EXPENSE");
    if (!rule || rule.trigger.kind !== "missingEvidenceForCategories") {
      throw new Error("RULE_MISSING_EVIDENCE_MATERIAL_EXPENSE missing or trigger kind changed");
    }

    expect(rule.trigger.minimumAmount).toBe(MATERIAL_EVIDENCE_MINIMUM_DEBIT);
    expect(rule.trigger.amountSide).toBe("debit");
    expect(new Set(rule.trigger.categories)).toEqual(MATERIAL_EVIDENCE_CATEGORIES);
    // The predicate treats exactly "none" as missing, so the rule must accept
    // every other status — otherwise the table flag and the fired rule disagree.
    expect(new Set(rule.trigger.acceptableEvidenceStatuses)).toEqual(
      new Set(EVIDENCE_STATUSES.filter((status) => status !== "none"))
    );
  });

  it("matches RULE_WHT_CREDIT_CANDIDATE", () => {
    const rule = rules.find((candidate) => candidate.id === "RULE_WHT_CREDIT_CANDIDATE");

    expect(rule?.trigger).toEqual({
      kind: "descriptionKeyword",
      keywords: WHT_KEYWORDS,
      amountSide: "credit"
    });
  });
});

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  const row = {
    date: "2026-02-10",
    description: "OUTWARD TRANSFER TO SUPPLIER",
    counterparty: "Unknown",
    debit: 1_500_000,
    credit: 0,
    balance: 0,
    sourceAccount: "GTB-001"
  };

  return {
    id: "t-1",
    caseId: "case-test",
    importId: "import-1",
    ...row,
    raw: row,
    category: "operating_expense",
    confidence: 0.9,
    reviewedByUser: false,
    evidenceStatus: "none",
    evidenceIds: [],
    ...overrides
  };
}
