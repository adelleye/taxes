"use client";

import { z } from "zod";
import { ReviewOutputSchema, TaxCaseSchema, TransactionSchema } from "@/domain/schemas";
import type { ReviewOutput, TaxCase, Transaction } from "@/domain/types";

const STORAGE_KEY = "nigeria-tax-workbench-current";

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
