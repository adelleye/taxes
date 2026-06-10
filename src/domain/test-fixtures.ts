import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSampleTaxCase } from "@/adapters/sample-case";
import { RuleBasedClassifier } from "@/domain/classification/rule-based-classifier";
import { createImportedTransactions, parseBankStatementCsv } from "@/domain/import/csv";
import { loadStaticTaxRules } from "@/domain/rules/rule-store";
import { runReviewEngine } from "@/domain/rules/rule-engine";

export function loadSeedCsvText(): string {
  return readFileSync(join(process.cwd(), "seed", "sample-statement.csv"), "utf8");
}

export function buildReviewedSeedFixture() {
  const taxCase = createSampleTaxCase();
  const { rows } = parseBankStatementCsv(loadSeedCsvText());
  const imported = createImportedTransactions(rows, taxCase.id);
  const classifier = new RuleBasedClassifier();
  const transactions = classifier.classifyBatch(imported, taxCase.businessProfile);
  const review = runReviewEngine({
    taxCase,
    transactions,
    rules: loadStaticTaxRules(),
    generatedAt: "2026-01-31T10:00:00.000Z"
  });

  return { taxCase, rows, transactions, review };
}
