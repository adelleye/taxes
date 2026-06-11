import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyTransactions } from "@/domain/classification/rule-based-classifier";
import { createImportedTransactions, parseBankStatementCsv } from "@/domain/import/csv";
import { loadStaticTaxRules } from "@/domain/rules/rule-store";
import { runReviewEngine } from "@/domain/rules/rule-engine";
import type { TaxCase } from "@/domain/types";

export function createSampleTaxCase(now = new Date("2026-01-31T09:00:00.000Z")): TaxCase {
  return {
    id: "case-nigeria-tax-workbench-sample",
    businessProfile: {
      legalName: "Adeleye Operations Limited",
      rcNumber: "RC-2048123",
      taxId: "TIN-01234567",
      state: "Lagos",
      entityType: "limited_company",
      accountingYearEnd: "12-31",
      turnoverBand: "NGN_300M_1B",
      fixedAssetsUnder250m: false,
      vatRegistered: true,
      hasEmployees: true,
      industry: "Technology services"
    },
    yearStart: "2026-01-01",
    yearEnd: "2026-12-31",
    status: "transactions_imported",
    createdAt: now.toISOString()
  };
}

export function loadSeedCsvText(): string {
  return readFileSync(join(process.cwd(), "seed", "sample-statement.csv"), "utf8");
}

export function buildReviewedSeedFixture() {
  const taxCase = createSampleTaxCase();
  const { rows } = parseBankStatementCsv(loadSeedCsvText());
  const transactions = classifyTransactions(createImportedTransactions(rows, taxCase.id));
  const review = runReviewEngine({
    taxCase,
    transactions,
    rules: loadStaticTaxRules(),
    generatedAt: "2026-01-31T10:00:00.000Z"
  });

  return { taxCase, rows, transactions, review };
}
