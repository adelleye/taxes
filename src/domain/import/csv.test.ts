import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmBankStatementImport,
  createHeaderFingerprint,
  createImportedTransactions,
  createSavedColumnMapping,
  findSavedColumnMapping,
  parseBankStatementCsv,
  previewBankStatementCsv,
  REQUIRED_BANK_STATEMENT_HEADERS
} from "@/domain/import/csv";
import { loadSeedCsvText } from "@/domain/test-fixtures";

const header = REQUIRED_BANK_STATEMENT_HEADERS.join(",");

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "src", "domain", "import", "fixtures", name), "utf8");
}

describe("previewBankStatementCsv", () => {
  it("keeps the production-shaped seed statement importable", () => {
    const preview = previewBankStatementCsv(loadSeedCsvText());

    expect(preview.status).toBe("ready");
    expect(preview.rowIssues).toHaveLength(0);
    expect(preview.rows).toHaveLength(11);
    expect(preview.rows[0]).toMatchObject({
      date: "2026-01-03",
      description: "CUSTOMER PAYMENT INV-1001",
      credit: 12000000,
      debit: 0,
      sourceAccount: "GTB-001"
    });
    expect(preview.rows[10]?.debit).toBe(1000000);
  });

  it("normalizes the sanitized Providus-style CSV and reconciles statement totals", () => {
    const preview = previewBankStatementCsv(fixture("providus-statement.csv"));

    expect(preview.status).toBe("ready");
    expect(preview.headerRowIndex).toBe(18);
    expect(preview.mapping).toMatchObject({
      date: "Transaction Date",
      description: "Transaction Details",
      debit: "Debit Amount",
      credit: "Credit Amount",
      balance: "Current Balance",
      reference: "DOC-NUM",
      amountMode: "debit_credit_columns"
    });
    expect(preview.rows).toHaveLength(399);
    expect(preview.reconciliation).toMatchObject({
      transactionCount: 399,
      skippedCount: 5,
      debitTotal: 48574497.94,
      creditTotal: 47425207.5,
      declaredDebitMatches: true,
      declaredCreditMatches: true,
      balanceWalkPass: true
    });
    expect(preview.metadata).toMatchObject({
      bankName: "PROVIDUS BANK",
      accountName: "SANITIZED COMPANY LIMITED",
      accountNumberMasked: "****2534",
      statementPeriodStart: "2026-04-01",
      statementPeriodEnd: "2026-06-03",
      openingBalance: 1288486.27,
      closingBalance: 139195.83,
      declaredDebitTotal: 48574497.94,
      declaredCreditTotal: 47425207.5
    });
    expect(preview.rows[0]).toMatchObject({
      date: "2026-04-02",
      debit: 285291.89,
      credit: 0,
      balance: 1003194.38,
      sourceAccount: "****2534",
      sourceBank: "PROVIDUS BANK",
      originalRowNumber: 20,
      reference: "DOC-0001"
    });
    expect(preview.rows[0]?.rawSource).toMatchObject({
      "Debit Amount": "285,291.89",
      "Current Balance": "1,003,194.38"
    });
    expect(preview.rowIssues.map((issue) => issue.message)).toEqual([
      "Non-transaction row",
      "Non-transaction row",
      "Blank row",
      "Non-transaction row",
      "Non-transaction row"
    ]);
  });

  it("imports a single signed amount CSV as debit or credit by sign", () => {
    const preview = previewBankStatementCsv(fixture("signed-amount.csv"));

    expect(preview.status).toBe("ready");
    expect(preview.mapping?.amountMode).toBe("signed_amount");
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]).toMatchObject({ credit: 2500, debit: 0 });
    expect(preview.rows[1]).toMatchObject({ debit: 750.25, credit: 0 });
  });

  it("imports a money-in/money-out CSV", () => {
    const preview = previewBankStatementCsv(fixture("money-in-out.csv"));

    expect(preview.status).toBe("ready");
    expect(preview.mapping?.amountMode).toBe("money_in_money_out");
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]).toMatchObject({ credit: 5000, debit: 0 });
    expect(preview.rows[1]).toMatchObject({ debit: 1500, credit: 0 });
  });

  it("returns a mapping preview instead of a missing-columns dead end", () => {
    const preview = previewBankStatementCsv(fixture("ambiguous-mapping.csv"));

    expect(preview.status).toBe("needs_mapping");
    expect(preview.headers).toEqual(["Posted", "Details", "Value"]);
    expect(preview.message).toBe("We could not confidently read this statement. Confirm the column mapping below.");
    expect(preview.message).not.toContain("missing required columns");
    expect(() => parseBankStatementCsv(fixture("ambiguous-mapping.csv"))).toThrow(
      "Confirm the column mapping below"
    );
  });

  it("can confirm a manual mapping after auto-detection needs help", () => {
    const { rows, skipped } = confirmBankStatementImport(fixture("ambiguous-mapping.csv"), {
      date: "Posted",
      description: "Details",
      amount: "Value",
      balance: "",
      amountMode: "signed_amount",
      dateFormat: "DD/MM/YYYY"
    });

    expect(skipped).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-05-01", credit: 5000 });
    expect(rows[1]).toMatchObject({ date: "2026-05-02", debit: 1500 });
  });

  it("reports invalid date rows without failing the whole file", () => {
    const csv = [
      "Date,Narration,Debit,Credit,Running Balance",
      "2026-05-01,CUSTOMER RECEIPT,,1000,1000",
      "not-a-date,BAD ROW,,500,1500",
      "2026-05-03,OFFICE RENT,200,,1300"
    ].join("\n");
    const preview = previewBankStatementCsv(csv);

    expect(preview.status).toBe("ready");
    expect(preview.rows).toHaveLength(2);
    expect(preview.rowIssues).toEqual([
      {
        rowNumber: 3,
        severity: "error",
        message: "Date could not be parsed",
        rawRow: ["not-a-date", "BAD ROW", "", "500", "1500"]
      }
    ]);
  });

  it("normalizes currency symbols, separators, whitespace and parentheses", () => {
    const csv = [
      "Posted Date,Narration,Amount,Running Balance",
      "01/05/2026,CUSTOMER RECEIPT,\" ₦2,500.50 \",\"2,500.50\"",
      "02/05/2026,SUPPLIER PAYMENT,\"(NGN 1,200.25)\",\"1,300.25\"",
      "03/05/2026,CUSTOMER RECEIPT,\"N 300.00\",\"1,600.25\""
    ].join("\n");
    const preview = previewBankStatementCsv(csv);

    expect(preview.status).toBe("ready");
    expect(preview.rows.map((row) => [row.debit, row.credit])).toEqual([
      [0, 2500.5],
      [1200.25, 0],
      [0, 300]
    ]);
  });

  it("creates and finds saved mappings by stable header fingerprint", () => {
    const preview = previewBankStatementCsv(fixture("providus-statement.csv"));
    const saved = createSavedColumnMapping(
      preview.headers,
      preview.mapping!,
      "PROVIDUS BANK",
      new Date("2026-06-03T10:00:00.000Z")
    );

    expect(saved.fingerprint).toBe(createHeaderFingerprint(preview.headers));
    expect(findSavedColumnMapping(preview.headers, [saved])).toEqual(saved);
  });
});

describe("parseBankStatementCsv", () => {
  it("keeps the old parsed-statement return shape", () => {
    const { rows, skipped } = parseBankStatementCsv(fixture("sample-statement.csv"));

    expect(skipped).toHaveLength(0);
    expect(rows).toHaveLength(11);
  });

  it("parses uploaded CSV text with edited amounts and quoted fields", () => {
    const uploadedCsv = [
      header,
      "2026-02-01,\"CUSTOMER PAYMENT, INV-2001\",Customer C,,15000000,15000000,GTB-002",
      "2026-02-02,OFFICE RENT FEBRUARY,Landlord Ltd,\"1,250,000\",,13750000,GTB-002"
    ].join("\n");

    const { rows } = parseBankStatementCsv(uploadedCsv);

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ debit: 1250000, credit: 0, balance: 13750000 });
  });
});

describe("createImportedTransactions", () => {
  const { rows } = parseBankStatementCsv(
    [header, "2026-02-01,ROW,Customer C,,1000,1000,GTB-002"].join("\n")
  );

  it("tags each row with the importId and a namespaced id", () => {
    const transactions = createImportedTransactions(rows, "case-local", "import-123");

    expect(transactions[0]).toMatchObject({
      caseId: "case-local",
      importId: "import-123",
      id: "import-123-txn-001"
    });
  });

  it("defaults the importId to the caseId for single-statement callers", () => {
    const transactions = createImportedTransactions(rows, "case-local");

    expect(transactions[0]?.importId).toBe("case-local");
    expect(transactions[0]?.id).toBe("case-local-txn-001");
  });
});
