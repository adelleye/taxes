import { join } from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MockCsvStatementSource } from "@/adapters/mock-csv-statement-source";
import { createSampleTaxCase } from "@/adapters/sample-case";
import { RuleBasedClassifier } from "@/domain/classification/rule-based-classifier";
import { createImportedTransactions } from "@/domain/import/csv";
import { BusinessProfileSchema, TaxCaseSchema, TransactionSchema } from "@/domain/schemas";

const SampleCaseRequestSchema = z
  .object({
    businessProfile: BusinessProfileSchema.optional()
  })
  .optional();

export async function POST(request: Request) {
  const json = await safeJson(request);
  const body = SampleCaseRequestSchema.parse(json);
  const taxCase = {
    ...createSampleTaxCase(),
    businessProfile: body?.businessProfile ?? createSampleTaxCase().businessProfile
  };

  const source = new MockCsvStatementSource(join(process.cwd(), "seed", "sample-statement.csv"));
  const rows = await source.importRows();
  const importedTransactions = createImportedTransactions(rows, taxCase.id);
  const classifier = new RuleBasedClassifier();
  const transactions = classifier.classifyBatch(importedTransactions, taxCase.businessProfile);

  return NextResponse.json({
    taxCase: TaxCaseSchema.parse(taxCase),
    transactions: TransactionSchema.array().parse(transactions)
  });
}

async function safeJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : undefined;
}
