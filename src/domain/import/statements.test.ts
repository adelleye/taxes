import { describe, expect, it } from "vitest";
import {
  createImportedTransactions,
  parseBankStatementCsv,
  REQUIRED_BANK_STATEMENT_HEADERS
} from "@/domain/import/csv";
import { summarizeStatements } from "@/domain/import/statements";

const header = REQUIRED_BANK_STATEMENT_HEADERS.join(",");

function batch(importId: string, lines: string[]) {
  const { rows } = parseBankStatementCsv([header, ...lines].join("\n"));
  return createImportedTransactions(rows, "case-local", importId);
}

describe("summarizeStatements", () => {
  it("groups transactions by importId with counts, accounts and date range", () => {
    const transactions = [
      ...batch("gtb", [
        "2026-01-03,A,Cust,,100,100,GTB-001",
        "2026-03-20,B,Cust,,200,300,GTB-001"
      ]),
      ...batch("zenith", ["2026-02-10,C,Cust,,50,50,ZEN-009"])
    ];

    const statements = summarizeStatements(transactions);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatchObject({
      importId: "gtb",
      count: 2,
      sourceAccounts: ["GTB-001"],
      startDate: "2026-01-03",
      endDate: "2026-03-20"
    });
    expect(statements[1]).toMatchObject({
      importId: "zenith",
      count: 1,
      sourceAccounts: ["ZEN-009"]
    });
  });

  it("keeps statement order and date range without requiring rows to arrive sorted", () => {
    const transactions = batch("gtb", [
      "2026-04-30,LAST,Cust,,100,100,GTB-001",
      "2026-01-01,FIRST,Cust,,100,200,GTB-002",
      "2026-03-15,MIDDLE,Cust,,100,300,GTB-001"
    ]);

    expect(summarizeStatements(transactions)[0]).toMatchObject({
      importId: "gtb",
      count: 3,
      sourceAccounts: ["GTB-001", "GTB-002"],
      startDate: "2026-01-01",
      endDate: "2026-04-30"
    });
  });

  it("returns nothing when there are no transactions", () => {
    expect(summarizeStatements([])).toEqual([]);
  });
});
