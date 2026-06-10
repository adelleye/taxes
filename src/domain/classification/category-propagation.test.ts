import { describe, expect, it } from "vitest";
import {
  findSimilarUnreviewedTransactionIds,
  narrationSignature
} from "@/domain/classification/category-propagation";
import type { Transaction, TransactionCategory } from "@/domain/types";

describe("narrationSignature", () => {
  it("groups the same payment shape across differing references and dates", () => {
    const a = signatureOf("NIP TRANSFER COMMISSION 290025 TO GUARANTY TRUST BANK PLC | OKEKE NNAMDI CHINEDU /000023260406104221002207694444");
    const b = signatureOf("NIP TRANSFER COMMISSION 1512228 TO GUARANTY TRUST BANK PLC | OKEKE NNAMDI CHINEDU /000023260410205638002208537678");

    expect(a).toBe(b);
  });

  it("keeps different payees in different groups", () => {
    const gtb = signatureOf("OUTWARD TRANSFER (N) 1512228 TO ACCESS BANK NIGERIA LTD | NNAMDI CHINEDU OKEKE");
    const landlord = signatureOf("OUTWARD TRANSFER (N) 1512229 TO ACCESS BANK NIGERIA LTD | LANDLORD PROPERTIES LTD");

    expect(gtb).not.toBe(landlord);
  });
});

describe("findSimilarUnreviewedTransactionIds", () => {
  const salaryA = transaction("a", "OUTWARD TRANSFER (N) 111 TO ACCESS BANK | OKEKE NNAMDI /0001", 500000, 0, "uncategorized");
  const salaryB = transaction("b", "OUTWARD TRANSFER (N) 222 TO ACCESS BANK | OKEKE NNAMDI /0002", 500000, 0, "uncategorized");
  const salaryReviewed = {
    ...transaction("c", "OUTWARD TRANSFER (N) 333 TO ACCESS BANK | OKEKE NNAMDI /0003", 500000, 0, "operating_expense"),
    reviewedByUser: true
  };
  const otherPayee = transaction("d", "OUTWARD TRANSFER (N) 444 TO ACCESS BANK | SOMEONE ELSE /0004", 500000, 0, "uncategorized");
  const sameShapeCredit = transaction("e", "OUTWARD TRANSFER (N) 555 TO ACCESS BANK | OKEKE NNAMDI /0005", 0, 500000, "uncategorized");

  it("matches unreviewed same-side rows with the same fingerprint only", () => {
    const ids = findSimilarUnreviewedTransactionIds(
      { ...salaryA, category: "payroll" },
      [salaryA, salaryB, salaryReviewed, otherPayee, sameShapeCredit],
      "payroll"
    );

    expect(ids).toEqual(["b"]);
  });

  it("never overwrites rows the user already reviewed", () => {
    const ids = findSimilarUnreviewedTransactionIds(
      { ...salaryA, category: "payroll" },
      [salaryA, salaryReviewed],
      "payroll"
    );

    expect(ids).toEqual([]);
  });
});

function signatureOf(description: string): string {
  return narrationSignature({ description, counterparty: "Unknown" });
}

function transaction(
  id: string,
  description: string,
  debit: number,
  credit: number,
  category: TransactionCategory
): Transaction {
  return {
    id,
    caseId: "case-test",
    importId: "import-1",
    date: "2026-02-10",
    description,
    counterparty: "Unknown",
    debit,
    credit,
    balance: 0,
    sourceAccount: "GTB-001",
    raw: {
      date: "2026-02-10",
      description,
      counterparty: "Unknown",
      debit,
      credit,
      balance: 0,
      sourceAccount: "GTB-001"
    },
    category,
    confidence: 0.45,
    reviewedByUser: false,
    evidenceStatus: "none",
    evidenceIds: []
  };
}
