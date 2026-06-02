import { readFile } from "node:fs/promises";
import type { StatementSource } from "@/adapters/contracts";
import type { ImportedStatementRow } from "@/domain/types";
import { parseBankStatementCsv } from "@/domain/import/csv";

export class MockCsvStatementSource implements StatementSource {
  constructor(private readonly filePath: string) {}

  async importRows(): Promise<ImportedStatementRow[]> {
    const csvText = await readFile(this.filePath, "utf8");
    return parseBankStatementCsv(csvText);
  }
}
