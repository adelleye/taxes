import Papa from "papaparse";
import type { ImportedStatementRow, Transaction } from "@/domain/types";
import { ImportedStatementRowSchema } from "@/domain/schemas";

export const REQUIRED_BANK_STATEMENT_HEADERS = [
  "date",
  "description",
  "counterparty",
  "debit",
  "credit",
  "balance",
  "sourceAccount"
] as const;

export type ImportAmountMode = "debit_credit_columns" | "signed_amount" | "money_in_money_out";

export interface StatementMetadata {
  bankName?: string;
  accountName?: string;
  accountNumberMasked?: string;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
  openingBalance?: number;
  closingBalance?: number;
  declaredDebitTotal?: number;
  declaredCreditTotal?: number;
}

export interface ColumnMapping {
  date: string;
  description: string;
  debit?: string;
  credit?: string;
  amount?: string;
  moneyIn?: string;
  moneyOut?: string;
  balance?: string;
  counterparty?: string;
  sourceAccount?: string;
  reference?: string;
  dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "DD-MM-YYYY" | "unknown";
  amountMode: ImportAmountMode;
}

export interface ImportRowIssue {
  rowNumber: number;
  severity: "error" | "warning" | "skipped";
  message: string;
  rawRow: string[];
}

export interface ImportPreview {
  status: "ready" | "needs_mapping" | "failed";
  headerRowIndex?: number;
  headers: string[];
  mapping?: ColumnMapping;
  metadata: StatementMetadata;
  previewRows: ImportedStatementRow[];
  rows: ImportedStatementRow[];
  rowIssues: ImportRowIssue[];
  reconciliation: {
    transactionCount: number;
    skippedCount: number;
    debitTotal: number;
    creditTotal: number;
    declaredDebitMatches?: boolean;
    declaredCreditMatches?: boolean;
    balanceWalkPass?: boolean;
  };
  message?: string;
  fingerprint?: string;
}

export interface SavedColumnMapping {
  fingerprint: string;
  label?: string;
  mapping: ColumnMapping;
  createdAt: string;
  updatedAt: string;
  confirmedByUser: boolean;
}

export interface ParsedStatement {
  rows: ImportedStatementRow[];
  /** Human-readable reasons for rows that couldn't be read, e.g. "Row 5: date is required". */
  skipped: string[];
}

interface HeaderCandidate {
  index: number;
  headers: string[];
  mapping: ColumnMapping;
  score: number;
}

interface DateParseResult {
  iso: string;
  format: NonNullable<ColumnMapping["dateFormat"]>;
}

interface NormalizedRows {
  rows: ImportedStatementRow[];
  rowIssues: ImportRowIssue[];
  metadata: StatementMetadata;
  reconciliation: ImportPreview["reconciliation"];
}

const REQUIRED_COLUMNS_MESSAGE = `Required columns: ${REQUIRED_BANK_STATEMENT_HEADERS.join(", ")}`;
const MAPPING_NEEDED_MESSAGE = "We could not confidently read this statement. Confirm the column mapping below.";
const MAX_HEADER_SCAN_ROWS = 50;
const SAMPLE_VALIDATION_ROWS = 20;
const MONEY_TOLERANCE = 0.05;

const HEADER_SYNONYMS = {
  date: ["transactiondate", "transdate", "postingdate", "posteddate", "date"],
  actualDate: ["actualtransactiondate", "actualdate"],
  valueDate: ["valuedate"],
  description: [
    "transactiondetails",
    "transactiondescription",
    "narration",
    "details",
    "particulars",
    "description",
    "remarks",
    "memo"
  ],
  debit: ["debitamount", "debit", "dr"],
  credit: ["creditamount", "credit", "cr"],
  moneyOut: ["moneyout", "withdrawal", "withdrawals", "outflow"],
  moneyIn: ["moneyin", "deposit", "deposits", "inflow"],
  amount: ["amount", "transactionamount", "amt"],
  balance: ["currentbalance", "balance", "runningbalance", "ledgerbalance", "availablebalance"],
  counterparty: ["counterparty", "beneficiary", "payee", "payer", "recipient", "sender"],
  sourceAccount: ["sourceaccount", "account", "accountnumber", "nuban", "nubanumber"],
  reference: ["docnum", "docnumber", "reference", "ref", "transactionid", "sessionid"]
} as const;

/**
 * Parses a bank-statement CSV. Structural problems that require user mapping
 * throw; individual malformed rows are skipped and reported so one bad line
 * can't block an otherwise-valid statement.
 */
export function parseBankStatementCsv(csvText: string): ParsedStatement {
  const preview = previewBankStatementCsv(csvText);

  if (preview.status !== "ready") {
    throw new Error(preview.message ?? `${MAPPING_NEEDED_MESSAGE} ${REQUIRED_COLUMNS_MESSAGE}.`);
  }

  return {
    rows: preview.rows,
    skipped: preview.rowIssues.map(formatImportRowIssue)
  };
}

export function previewBankStatementCsv(
  csvText: string,
  savedMappings: SavedColumnMapping[] = [],
  mappingOverride?: ColumnMapping
): ImportPreview {
  const records = parseCsvRecords(csvText);
  const emptyPreview = createEmptyPreview();

  if (records.length === 0) {
    return {
      ...emptyPreview,
      status: "failed",
      message: `CSV is empty. ${REQUIRED_COLUMNS_MESSAGE}.`
    };
  }

  const overrideHeaderIndex = mappingOverride ? findHeaderIndexForMapping(records, mappingOverride) : undefined;
  const candidate = mappingOverride
    ? overrideHeaderIndex === undefined
      ? undefined
      : {
          index: overrideHeaderIndex,
          headers: records[overrideHeaderIndex] ?? [],
          mapping: mappingOverride,
          score: 100
        }
    : findBestHeaderCandidate(records);

  if (!candidate) {
    const fallbackHeaders = firstLikelyHeader(records);
    return {
      ...emptyPreview,
      status: "needs_mapping",
      headers: fallbackHeaders,
      metadata: mineStatementMetadata(records),
      message: MAPPING_NEEDED_MESSAGE
    };
  }

  const headers = normalizeHeaderCells(candidate.headers);
  const metadata = mineStatementMetadata(records, candidate.index);
  const fingerprint = createHeaderFingerprint(headers);
  const savedMapping = mappingOverride ? undefined : findSavedColumnMapping(headers, savedMappings);
  const mapping = savedMapping?.mapping ?? candidate.mapping;
  const mappingShapeError = validateMappingShape(mapping);

  if (mappingShapeError) {
    return {
      ...emptyPreview,
      status: "needs_mapping",
      headerRowIndex: candidate.index + 1,
      headers,
      mapping,
      metadata,
      message: mappingShapeError,
      fingerprint
    };
  }

  const normalized = normalizeStatementRows(records, candidate.index, headers, mapping, metadata);
  const isReady = normalized.rows.length > 0 && mappingLooksReliable(records, candidate.index, headers, mapping, metadata);

  return {
    status: isReady ? "ready" : "needs_mapping",
    headerRowIndex: candidate.index + 1,
    headers,
    mapping: { ...mapping, dateFormat: mapping.dateFormat ?? detectMappingDateFormat(normalized.rows) },
    metadata: normalized.metadata,
    previewRows: normalized.rows.slice(0, 10),
    rows: normalized.rows,
    rowIssues: normalized.rowIssues,
    reconciliation: normalized.reconciliation,
    message: isReady ? undefined : MAPPING_NEEDED_MESSAGE,
    fingerprint
  };
}

export function confirmBankStatementImport(csvText: string, mapping: ColumnMapping): ParsedStatement {
  const preview = previewBankStatementCsv(csvText, [], mapping);

  if (preview.status !== "ready") {
    throw new Error(preview.message ?? MAPPING_NEEDED_MESSAGE);
  }

  return {
    rows: preview.rows,
    skipped: preview.rowIssues.map(formatImportRowIssue)
  };
}

export function createImportedTransactions(
  rows: ImportedStatementRow[],
  caseId: string,
  importId: string = caseId
): Transaction[] {
  return rows.map((row, index) => ({
    ...row,
    id: `${importId}-txn-${String(index + 1).padStart(3, "0")}`,
    caseId,
    importId,
    category: "uncategorized",
    confidence: 0,
    reviewedByUser: false,
    evidenceStatus: "none"
  }));
}

export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function createHeaderFingerprint(headers: string[]): string {
  const input = headers.map(normalizeHeader).join("|");
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return `csv-${(hash >>> 0).toString(36)}`;
}

export function findSavedColumnMapping(
  headers: string[],
  savedMappings: SavedColumnMapping[]
): SavedColumnMapping | undefined {
  const fingerprint = createHeaderFingerprint(headers);
  return savedMappings.find((saved) => saved.fingerprint === fingerprint);
}

export function createSavedColumnMapping(
  headers: string[],
  mapping: ColumnMapping,
  label = "Uploaded statement",
  now = new Date()
): SavedColumnMapping {
  const timestamp = now.toISOString();

  return {
    fingerprint: createHeaderFingerprint(headers),
    label,
    mapping,
    createdAt: timestamp,
    updatedAt: timestamp,
    confirmedByUser: true
  };
}

function createEmptyPreview(): ImportPreview {
  return {
    status: "failed",
    headers: [],
    metadata: {},
    previewRows: [],
    rows: [],
    rowIssues: [],
    reconciliation: {
      transactionCount: 0,
      skippedCount: 0,
      debitTotal: 0,
      creditTotal: 0
    }
  };
}

function parseCsvRecords(csvText: string): string[][] {
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: false,
    dynamicTyping: false
  });
  const records = parsed.data.map((row) => row.map((cell) => String(cell ?? "").trim()));

  while (records.length > 0 && isBlankRow(records[records.length - 1] ?? [])) {
    records.pop();
  }

  return records;
}

function findBestHeaderCandidate(records: string[][]): HeaderCandidate | undefined {
  let best: HeaderCandidate | undefined;
  const limit = Math.min(records.length, MAX_HEADER_SCAN_ROWS);

  for (let index = 0; index < limit; index += 1) {
    const headers = normalizeHeaderCells(records[index] ?? []);
    const mapping = detectColumnMapping(headers);

    if (!mapping) {
      continue;
    }

    const score = scoreMapping(headers, mapping);
    const candidate = { index, headers, mapping, score };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

function findHeaderIndexForMapping(records: string[][], mapping: ColumnMapping): number | undefined {
  const required = [mapping.date, mapping.description].filter(Boolean).map(normalizeHeader);
  const amountHeaders = amountMappingHeaders(mapping).map(normalizeHeader);
  const expected = [...required, ...amountHeaders];

  const index = records.findIndex((row) => {
    const normalized = new Set(row.map(normalizeHeader));
    return expected.every((header) => normalized.has(header));
  });

  return index >= 0 ? index : undefined;
}

function firstLikelyHeader(records: string[][]): string[] {
  const row = records.find((record) => record.filter((cell) => cell.trim().length > 0).length >= 2);
  return normalizeHeaderCells(row ?? []);
}

function normalizeHeaderCells(headers: string[]): string[] {
  return headers.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim()
  );
}

function detectColumnMapping(headers: string[]): ColumnMapping | undefined {
  const date =
    findHeader(headers, HEADER_SYNONYMS.date) ??
    findHeader(headers, HEADER_SYNONYMS.valueDate) ??
    findHeader(headers, HEADER_SYNONYMS.actualDate);
  const description = findHeader(headers, HEADER_SYNONYMS.description);
  const debit = findHeader(headers, HEADER_SYNONYMS.debit);
  const credit = findHeader(headers, HEADER_SYNONYMS.credit);
  const moneyOut = findHeader(headers, HEADER_SYNONYMS.moneyOut);
  const moneyIn = findHeader(headers, HEADER_SYNONYMS.moneyIn);
  const amount = findHeader(headers, HEADER_SYNONYMS.amount);

  if (!date || !description) {
    return undefined;
  }

  const baseMapping = {
    date,
    description,
    balance: findHeader(headers, HEADER_SYNONYMS.balance),
    counterparty: findHeader(headers, HEADER_SYNONYMS.counterparty),
    sourceAccount: findHeader(headers, HEADER_SYNONYMS.sourceAccount),
    reference: findHeader(headers, HEADER_SYNONYMS.reference),
    dateFormat: "unknown" as const
  };

  if (debit && credit) {
    return {
      ...baseMapping,
      debit,
      credit,
      amountMode: "debit_credit_columns"
    };
  }

  if (moneyIn && moneyOut) {
    return {
      ...baseMapping,
      moneyIn,
      moneyOut,
      amountMode: "money_in_money_out"
    };
  }

  if (amount) {
    return {
      ...baseMapping,
      amount,
      amountMode: "signed_amount"
    };
  }

  return undefined;
}

function findHeader(headers: string[], synonyms: readonly string[]): string | undefined {
  return headers.find((header) => synonyms.includes(normalizeHeader(header)));
}

function scoreMapping(headers: string[], mapping: ColumnMapping): number {
  const mappedOptionalFields = [
    mapping.balance,
    mapping.counterparty,
    mapping.sourceAccount,
    mapping.reference
  ].filter(Boolean).length;
  const amountWeight = mapping.amountMode === "debit_credit_columns" ? 6 : 4;

  return headers.filter(Boolean).length + mappedOptionalFields + amountWeight;
}

function validateMappingShape(mapping: ColumnMapping): string | null {
  if (!mapping.date || !mapping.description) {
    return "Choose a date column and a description column before importing.";
  }

  if (mapping.amountMode === "debit_credit_columns" && (!mapping.debit || !mapping.credit)) {
    return "Choose debit and credit columns before importing.";
  }

  if (mapping.amountMode === "signed_amount" && !mapping.amount) {
    return "Choose the signed amount column before importing.";
  }

  if (mapping.amountMode === "money_in_money_out" && (!mapping.moneyIn || !mapping.moneyOut)) {
    return "Choose money in and money out columns before importing.";
  }

  return null;
}

function amountMappingHeaders(mapping: ColumnMapping): string[] {
  if (mapping.amountMode === "signed_amount") {
    return mapping.amount ? [mapping.amount] : [];
  }

  if (mapping.amountMode === "money_in_money_out") {
    return [mapping.moneyIn, mapping.moneyOut].filter((value): value is string => Boolean(value));
  }

  return [mapping.debit, mapping.credit].filter((value): value is string => Boolean(value));
}

function mappingLooksReliable(
  records: string[][],
  headerIndex: number,
  headers: string[],
  mapping: ColumnMapping,
  metadata: StatementMetadata
): boolean {
  const sampleRecords = records.slice(0, Math.min(records.length, headerIndex + SAMPLE_VALIDATION_ROWS + 1));
  const normalized = normalizeStatementRows(sampleRecords, headerIndex, headers, mapping, metadata);
  const readCell = createCellReader(headers);
  const possibleRows = sampleRecords
    .slice(headerIndex + 1)
    .filter((row) => !isBlankRow(row) && !isJunkRow(row, readCell(row, mapping.description)))
    .length;
  const accountedRows =
    normalized.rows.length + normalized.rowIssues.filter((issue) => issue.severity === "error").length;

  return normalized.rows.length > 0 && accountedRows >= Math.min(3, Math.max(1, possibleRows));
}

function normalizeStatementRows(
  records: string[][],
  headerIndex: number,
  headers: string[],
  mapping: ColumnMapping,
  baseMetadata: StatementMetadata
): NormalizedRows {
  const metadata: StatementMetadata = { ...baseMetadata };
  const rows: ImportedStatementRow[] = [];
  const rowIssues: ImportRowIssue[] = [];
  const readCell = createCellReader(headers);
  let debitTotal = 0;
  let creditTotal = 0;
  let previousBalance = metadata.openingBalance;
  let balanceChecks = 0;
  let balanceFailures = 0;

  for (let rowIndex = headerIndex + 1; rowIndex < records.length; rowIndex += 1) {
    const rawRow = padRow(records[rowIndex] ?? [], headers.length);
    const rowNumber = rowIndex + 1;

    if (isBlankRow(rawRow)) {
      rowIssues.push({ rowNumber, severity: "skipped", message: "Blank row", rawRow });
      continue;
    }

    const description = readCell(rawRow, mapping.description);

    if (isJunkRow(rawRow, description)) {
      updateOpeningOrClosingBalance(metadata, rawRow, readCell, mapping, description);
      rowIssues.push({ rowNumber, severity: "skipped", message: "Non-transaction row", rawRow });
      continue;
    }

    const date = parseStatementDate(readCell(rawRow, mapping.date), mapping.dateFormat);

    if (!date) {
      rowIssues.push({
        rowNumber,
        severity: hasNumericCell(rawRow) ? "error" : "skipped",
        message: hasNumericCell(rawRow) ? "Date could not be parsed" : "Non-transaction row",
        rawRow
      });
      continue;
    }

    if (!description) {
      rowIssues.push({ rowNumber, severity: "error", message: "Description is required", rawRow });
      continue;
    }

    try {
      const { debit, credit } = parseDebitCredit(rawRow, readCell, mapping);
      const balance = mapping.balance ? parseOptionalAmount(readCell(rawRow, mapping.balance)) : 0;

      if (debit === 0 && credit === 0) {
        rowIssues.push({ rowNumber, severity: "skipped", message: "No debit or credit amount", rawRow });
        continue;
      }

      const row = ImportedStatementRowSchema.safeParse({
        date: date.iso,
        description,
        counterparty: readOptionalCell(rawRow, readCell, mapping.counterparty) || "Unknown",
        debit,
        credit,
        balance,
        sourceAccount: readOptionalCell(rawRow, readCell, mapping.sourceAccount) || defaultSourceAccount(metadata),
        reference: readOptionalCell(rawRow, readCell, mapping.reference) || undefined,
        sourceBank: metadata.bankName,
        originalRowNumber: rowNumber,
        rawSource: rawSourceFor(rawRow, headers)
      });

      if (!row.success) {
        rowIssues.push({
          rowNumber,
          severity: "error",
          message: formatRowValidationError(row.error.issues),
          rawRow
        });
        continue;
      }

      debitTotal = roundMoney(debitTotal + row.data.debit);
      creditTotal = roundMoney(creditTotal + row.data.credit);

      if (mapping.balance && row.data.balance !== 0) {
        if (previousBalance !== undefined) {
          const expectedBalance = roundMoney(previousBalance + row.data.credit - row.data.debit);
          balanceChecks += 1;
          if (!moneyEquals(expectedBalance, row.data.balance)) {
            balanceFailures += 1;
          }
        }

        previousBalance = row.data.balance;
      }

      rows.push(row.data);
    } catch (error) {
      rowIssues.push({
        rowNumber,
        severity: "error",
        message: error instanceof Error ? error.message : "Row could not be normalized",
        rawRow
      });
    }
  }

  const reconciliation: ImportPreview["reconciliation"] = {
    transactionCount: rows.length,
    skippedCount: rowIssues.length,
    debitTotal,
    creditTotal,
    declaredDebitMatches:
      metadata.declaredDebitTotal === undefined ? undefined : moneyEquals(metadata.declaredDebitTotal, debitTotal),
    declaredCreditMatches:
      metadata.declaredCreditTotal === undefined ? undefined : moneyEquals(metadata.declaredCreditTotal, creditTotal),
    balanceWalkPass: balanceChecks === 0 ? undefined : balanceFailures === 0
  };

  return { rows, rowIssues, metadata, reconciliation };
}

function mineStatementMetadata(records: string[][], headerIndex = Math.min(records.length, 30)): StatementMetadata {
  const metadata: StatementMetadata = {};
  const limit = Math.min(records.length, Math.max(0, headerIndex), 30);

  for (let index = 0; index < limit; index += 1) {
    const row = records[index] ?? [];
    const joined = row.join(" ").trim();

    if (!metadata.bankName && /\bbank\b/i.test(joined)) {
      metadata.bankName = joined.replace(/\s+/g, " ");
    }

    const period = joined.match(/from date\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+to date\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (period) {
      metadata.statementPeriodStart = parseStatementDate(period[1], "DD/MM/YYYY")?.iso;
      metadata.statementPeriodEnd = parseStatementDate(period[2], "DD/MM/YYYY")?.iso;
    }

    for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
      const label = normalizeHeader(row[cellIndex] ?? "");
      const nextValue = nextNonEmptyCell(row, cellIndex + 1);

      if (!nextValue) {
        continue;
      }

      if (label.includes("customername") || label.includes("accountname")) {
        metadata.accountName = nextValue;
      } else if (label.includes("nuban") || label.includes("accountnumber")) {
        metadata.accountNumberMasked = maskAccountNumber(nextValue);
      } else if (label.includes("totaldebitamount")) {
        metadata.declaredDebitTotal = parseOptionalAmount(nextValue);
      } else if (label.includes("totalcreditamount")) {
        metadata.declaredCreditTotal = parseOptionalAmount(nextValue);
      } else if (label.includes("periodopeningbalance") || label === "openingbalance") {
        metadata.openingBalance = parseOptionalAmount(nextValue);
      } else if (label.includes("periodclosingbalance") || label === "closingbalance") {
        metadata.closingBalance = parseOptionalAmount(nextValue);
      }
    }
  }

  return metadata;
}

function updateOpeningOrClosingBalance(
  metadata: StatementMetadata,
  row: string[],
  readCell: CellReader,
  mapping: ColumnMapping,
  description: string
) {
  if (!mapping.balance) {
    return;
  }

  const balance = parseOptionalAmount(readCell(row, mapping.balance));
  const normalizedDescription = normalizeHeader(description);

  if (balance === 0) {
    return;
  }

  if (normalizedDescription.includes("balancebf") || normalizedDescription.includes("openingbalance")) {
    metadata.openingBalance = balance;
  } else if (normalizedDescription.includes("closingbalance")) {
    metadata.closingBalance = balance;
  }
}

type CellReader = (row: string[], header: string | undefined) => string;

/**
 * Resolves mapped headers to column indexes once, instead of re-normalizing
 * and scanning the header row for every cell of every transaction. Keeps
 * cellFor's first-match semantics for duplicate normalized headers.
 */
function createCellReader(headers: string[]): CellReader {
  const indexByNormalizedHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!indexByNormalizedHeader.has(normalized)) {
      indexByNormalizedHeader.set(normalized, index);
    }
  });
  const indexByMappedHeader = new Map<string, number>();

  return (row, header) => {
    if (!header) {
      return "";
    }

    let index = indexByMappedHeader.get(header);
    if (index === undefined) {
      index = indexByNormalizedHeader.get(normalizeHeader(header)) ?? -1;
      indexByMappedHeader.set(header, index);
    }

    return index >= 0 ? row[index]?.trim() ?? "" : "";
  };
}

function readOptionalCell(row: string[], readCell: CellReader, header: string | undefined): string {
  return readCell(row, header).trim();
}

function parseDebitCredit(row: string[], readCell: CellReader, mapping: ColumnMapping): { debit: number; credit: number } {
  if (mapping.amountMode === "signed_amount") {
    const amount = parseOptionalAmount(readCell(row, mapping.amount));
    return amount >= 0 ? { debit: 0, credit: amount } : { debit: Math.abs(amount), credit: 0 };
  }

  if (mapping.amountMode === "money_in_money_out") {
    return {
      debit: Math.abs(parseOptionalAmount(readCell(row, mapping.moneyOut))),
      credit: Math.abs(parseOptionalAmount(readCell(row, mapping.moneyIn)))
    };
  }

  return {
    debit: Math.abs(parseOptionalAmount(readCell(row, mapping.debit))),
    credit: Math.abs(parseOptionalAmount(readCell(row, mapping.credit)))
  };
}

function parseOptionalAmount(value: string | undefined): number {
  const trimmed = (value ?? "").trim();

  if (trimmed === "") {
    return 0;
  }

  const negative = trimmed.startsWith("-") || /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/NGN/gi, "")
    .replace(/[₦,\s]/g, "")
    .replace(/^N(?=\d)/i, "")
    .replace(/^-/, "")
    .replace(/[()]/g, "");
  const amount = Number(cleaned);

  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a number");
  }

  return roundMoney(negative ? -amount : amount);
}

function parseStatementDate(
  value: string | undefined,
  preferredFormat: ColumnMapping["dateFormat"] = "unknown"
): DateParseResult | null {
  const input = (value ?? "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return isValidDateParts(Number(input.slice(0, 4)), Number(input.slice(5, 7)), Number(input.slice(8, 10)))
      ? { iso: input, format: "YYYY-MM-DD" }
      : null;
  }

  const slash = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    const day = preferredFormat === "MM/DD/YYYY" ? second : first;
    const month = preferredFormat === "MM/DD/YYYY" ? first : second;

    return toDateResult(year, month, day, preferredFormat === "MM/DD/YYYY" ? "MM/DD/YYYY" : "DD/MM/YYYY");
  }

  const dashed = input.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashed) {
    return toDateResult(Number(dashed[3]), Number(dashed[2]), Number(dashed[1]), "DD-MM-YYYY");
  }

  const named = input.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{4})$/);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    return month ? toDateResult(Number(named[3]), Number(month), Number(named[1]), "DD-MM-YYYY") : null;
  }

  return null;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

function toDateResult(
  year: number,
  month: number,
  day: number,
  format: NonNullable<ColumnMapping["dateFormat"]>
): DateParseResult | null {
  if (!isValidDateParts(year, month, day)) {
    return null;
  }

  return { iso: `${year}-${pad2(month)}-${pad2(day)}`, format };
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function detectMappingDateFormat(rows: ImportedStatementRow[]): ColumnMapping["dateFormat"] {
  return rows.length > 0 ? "YYYY-MM-DD" : "unknown";
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim().length === 0);
}

function isJunkRow(row: string[], description: string): boolean {
  const joined = row.join(" ").trim().toLowerCase();
  const normalizedDescription = normalizeHeader(description);

  return (
    normalizedDescription === "balancebf" ||
    normalizedDescription.includes("openingbalance") ||
    normalizedDescription.includes("closingbalance") ||
    /\btotal\b/i.test(joined) ||
    joined === "disclaimer" ||
    joined.includes("computer generated document") ||
    joined.includes("terms and conditions")
  );
}

function hasNumericCell(row: string[]): boolean {
  return row.some((cell) => /\d/.test(cell));
}

function padRow(row: string[], length: number): string[] {
  return Array.from({ length }, (_, index) => row[index]?.trim() ?? "");
}

function rawSourceFor(row: string[], headers: string[]): Record<string, string> {
  const rawSource: Record<string, string> = {};

  headers.forEach((header, index) => {
    const key = header || `Column ${index + 1}`;
    rawSource[key] = row[index] ?? "";
  });

  return rawSource;
}

function nextNonEmptyCell(row: string[], startIndex: number): string {
  for (let index = startIndex; index < row.length; index += 1) {
    const value = row[index]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function maskAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 4) {
    return value;
  }

  return `****${digits.slice(-4)}`;
}

function defaultSourceAccount(metadata: StatementMetadata): string {
  return metadata.accountNumberMasked ?? metadata.bankName ?? "Uploaded statement";
}

function formatImportRowIssue(issue: ImportRowIssue): string {
  return `Row ${issue.rowNumber}: ${issue.message}`;
}

function formatRowValidationError(
  issues: Array<{ path: Array<string | number | symbol>; message: string }>
): string {
  return issues
    .map((issue) => {
      const field = String(issue.path[0] ?? "row");

      switch (field) {
        case "date":
          return "date must use YYYY-MM-DD";
        case "description":
          return "description is required";
        case "counterparty":
          return "counterparty is required";
        case "debit":
        case "credit":
          return `${field} must be zero or a positive number`;
        case "balance":
          return "balance must be a number";
        case "sourceAccount":
          return "sourceAccount is required";
        default:
          return issue.message;
      }
    })
    .join("; ");
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyEquals(left: number, right: number): boolean {
  return Math.abs(left - right) <= MONEY_TOLERANCE;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
