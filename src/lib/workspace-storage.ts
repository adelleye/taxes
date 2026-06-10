"use client";

import { z } from "zod";
import type { SavedColumnMapping } from "@/domain/import/csv";
import { ReviewOutputSchema, TaxCaseSchema, TransactionSchema } from "@/domain/schemas";
import type { ReviewOutput, TaxCase, Transaction } from "@/domain/types";

// v2: NTA 2025 model (fixedAssetsUnder250m, Development Levy fields). Old
// saved workspaces hold estimates from the pre-levy model — re-importing is
// safer than showing stale numbers, so the key is versioned instead of migrated.
const STORAGE_KEY = "nigeria-tax-workbench-current-v2";
const COLUMN_MAPPINGS_KEY = "nigeria-tax-workbench-column-mappings";

const SavedWorkspaceSchema = z.object({
  taxCase: TaxCaseSchema,
  transactions: z.array(TransactionSchema).min(1),
  review: ReviewOutputSchema.nullable()
});

export interface SavedWorkspace {
  taxCase: TaxCase;
  transactions: Transaction[];
  review: ReviewOutput | null;
}

export function saveWorkspace(workspace: SavedWorkspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(SavedWorkspaceSchema.parse(workspace)));
}

export function loadWorkspace(): SavedWorkspace | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const parsed = SavedWorkspaceSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export function clearWorkspace() {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadSavedColumnMappings(): SavedColumnMapping[] {
  const raw = localStorage.getItem(COLUMN_MAPPINGS_KEY);
  if (!raw) {
    return [];
  }

  const parsed = SavedColumnMappingListSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : [];
}

export function saveColumnMapping(mapping: SavedColumnMapping) {
  const mappings = loadSavedColumnMappings();
  const nextMappings = [
    mapping,
    ...mappings.filter((saved) => saved.fingerprint !== mapping.fingerprint)
  ].slice(0, 20);

  localStorage.setItem(COLUMN_MAPPINGS_KEY, JSON.stringify(SavedColumnMappingListSchema.parse(nextMappings)));
}

const ColumnMappingSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  debit: z.string().optional(),
  credit: z.string().optional(),
  amount: z.string().optional(),
  moneyIn: z.string().optional(),
  moneyOut: z.string().optional(),
  balance: z.string().optional(),
  counterparty: z.string().optional(),
  sourceAccount: z.string().optional(),
  reference: z.string().optional(),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "unknown"]).optional(),
  amountMode: z.enum(["debit_credit_columns", "signed_amount", "money_in_money_out"])
});

const SavedColumnMappingListSchema = z.array(
  z.object({
    fingerprint: z.string().min(1),
    label: z.string().optional(),
    mapping: ColumnMappingSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    confirmedByUser: z.boolean()
  })
);
