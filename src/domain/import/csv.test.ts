import { describe, expect, it } from "vitest";
import { parseBankStatementCsv } from "@/domain/import/csv";
import { loadSeedCsvText } from "@/domain/test-fixtures";

describe("parseBankStatementCsv", () => {
  it("parses the production-shaped seed statement", () => {
    const rows = parseBankStatementCsv(loadSeedCsvText());

    expect(rows).toHaveLength(11);
    expect(rows[0]).toMatchObject({
      date: "2026-01-03",
      description: "CUSTOMER PAYMENT INV-1001",
      credit: 12000000,
      debit: 0,
      sourceAccount: "GTB-001"
    });
    expect(rows[10]?.debit).toBe(1000000);
  });
});
