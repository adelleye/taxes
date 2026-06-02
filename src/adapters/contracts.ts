import type {
  BusinessProfile,
  ImportedStatementRow,
  TaxRuleConfig,
  Transaction
} from "@/domain/types";

export interface StatementSource {
  importRows(): Promise<ImportedStatementRow[]>;
}

export interface ClassifierAdapter {
  classify(transaction: Transaction, profile: BusinessProfile): Transaction;
  classifyBatch(transactions: Transaction[], profile: BusinessProfile): Transaction[];
}

export interface RuleStore {
  listRules(): Promise<TaxRuleConfig[]>;
}
