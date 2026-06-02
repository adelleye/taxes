import type { ImportedStatementRow, Transaction } from "@/domain/types";
import { ImportedStatementRowSchema } from "@/domain/schemas";

const REQUIRED_HEADERS = [
  "date",
  "description",
  "counterparty",
  "debit",
  "credit",
  "balance",
  "sourceAccount"
] as const;

export function parseBankStatementCsv(csvText: string): ImportedStatementRow[] {
  const records = parseCsvRecords(csvText.trim());
  const [headers, ...rows] = records;

  if (!headers) {
    throw new Error("CSV is empty.");
  }

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV missing required header(s): ${missingHeaders.join(", ")}`);
  }

  return rows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row, index) => {
      const record = Object.fromEntries(
        headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""])
      );

      const parsed = ImportedStatementRowSchema.safeParse({
        date: record.date,
        description: record.description,
        counterparty: record.counterparty,
        debit: parseAmount(record.debit),
        credit: parseAmount(record.credit),
        balance: parseSignedAmount(record.balance),
        sourceAccount: record.sourceAccount
      });

      if (!parsed.success) {
        throw new Error(`Invalid CSV row ${index + 2}: ${parsed.error.message}`);
      }

      return parsed.data;
    });
}

export function createImportedTransactions(
  rows: ImportedStatementRow[],
  caseId: string
): Transaction[] {
  return rows.map((row, index) => ({
    ...row,
    id: `${caseId}-txn-${String(index + 1).padStart(3, "0")}`,
    caseId,
    raw: row,
    category: "uncategorized",
    confidence: 0,
    reviewedByUser: false,
    evidenceStatus: "none",
    evidenceIds: []
  }));
}

function parseAmount(value: string | undefined): number {
  if (!value || value.trim() === "") {
    return 0;
  }

  return parseSignedAmount(value);
}

function parseSignedAmount(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const normalized = value.replace(/[,\s]/g, "");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid amount: ${value}`);
  }
  return amount;
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === "\"" && inQuotes && nextChar === "\"") {
      field += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      record.push(field.trim());
      records.push(record);
      record = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field.trim());
    records.push(record);
  }

  return records;
}
