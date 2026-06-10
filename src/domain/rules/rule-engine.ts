import type {
  AmountSide,
  EstimatedTaxImpact,
  ReviewOutput,
  SourceFact,
  TaxCase,
  TaxRuleConfig,
  TaxSuggestion,
  Transaction,
  TransactionCategory
} from "@/domain/types";
import { ReviewOutputSchema } from "@/domain/schemas";
import { summarizeTaxPack } from "@/domain/summary/tax-pack";
import { includesAnyKeyword } from "@/domain/text-match";

interface ReviewEngineInput {
  taxCase: TaxCase;
  transactions: Transaction[];
  rules: TaxRuleConfig[];
  generatedAt?: string;
}

interface DuplicatePair {
  debitTransaction: Transaction;
  creditTransaction: Transaction;
}

interface IndexedTransaction {
  transaction: Transaction;
  normalizedDescription: string;
  order: number;
}

interface ReviewIndex {
  entries: IndexedTransaction[];
  debitEntries: IndexedTransaction[];
  creditEntries: IndexedTransaction[];
  reversalCreditEntries: IndexedTransaction[];
  byCategory: Map<TransactionCategory, IndexedTransaction[]>;
}

interface DuplicateCreditQueue {
  entries: IndexedTransaction[];
  cursor: number;
}

export function runReviewEngine(input: ReviewEngineInput): ReviewOutput {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const index = buildReviewIndex(input.transactions);
  const firedSuggestions: TaxSuggestion[] = [];

  for (const rule of input.rules) {
    if (rule.enabled) {
      firedSuggestions.push(...fireRule(rule, input.taxCase, index));
    }
  }

  const summary = summarizeTaxPack(input.transactions, input.taxCase.businessProfile, firedSuggestions);
  const groupedSuggestions = groupSuggestionsBySeverity(firedSuggestions);
  const output: ReviewOutput = {
    caseId: input.taxCase.id,
    generatedAt,
    errors: groupedSuggestions.errors,
    warnings: groupedSuggestions.warnings,
    suggestions: groupedSuggestions.suggestions,
    summary
  };

  return ReviewOutputSchema.parse(output);
}

function fireRule(
  rule: TaxRuleConfig,
  taxCase: TaxCase,
  index: ReviewIndex
): TaxSuggestion[] {
  switch (rule.trigger.kind) {
    case "transactionCategory": {
      const trigger = rule.trigger;
      const suggestions: TaxSuggestion[] = [];

      for (const { transaction } of selectEntriesByCategories(index, trigger.categories)) {
        if (!matchesAmountSide(transaction, trigger.amountSide)) {
          continue;
        }

        suggestions.push(
          createTransactionSuggestion(rule, taxCase.id, transaction, [
            transactionFact(transaction, "category", transaction.category),
            transactionFact(transaction, "description", transaction.description),
            transactionFact(transaction, "amount", amountForTrigger(transaction, trigger.amountSide))
          ])
        );
      }

      return suggestions;
    }

    case "descriptionKeyword": {
      const trigger = rule.trigger;
      const keywords = trigger.keywords.map((keyword) => keyword.toUpperCase());
      const suggestions: TaxSuggestion[] = [];

      for (const entry of selectEntriesByAmountSide(index, trigger.amountSide)) {
        if (!includesAnyKeyword(entry.normalizedDescription, keywords)) {
          continue;
        }

        suggestions.push(
          createTransactionSuggestion(rule, taxCase.id, entry.transaction, [
            transactionFact(entry.transaction, "description", entry.transaction.description),
            transactionFact(entry.transaction, "credit", entry.transaction.credit)
          ])
        );
      }

      return suggestions;
    }

    case "missingEvidenceForCategories": {
      const trigger = rule.trigger;
      const acceptableEvidenceStatuses = new Set(trigger.acceptableEvidenceStatuses);
      const suggestions: TaxSuggestion[] = [];

      for (const { transaction } of selectEntriesByCategories(index, trigger.categories)) {
        if (
          !matchesAmountSide(transaction, trigger.amountSide) ||
          amountForTrigger(transaction, trigger.amountSide) < trigger.minimumAmount ||
          acceptableEvidenceStatuses.has(transaction.evidenceStatus)
        ) {
          continue;
        }

        suggestions.push(
          createTransactionSuggestion(rule, taxCase.id, transaction, [
            transactionFact(transaction, "category", transaction.category),
            transactionFact(transaction, "evidenceStatus", transaction.evidenceStatus),
            transactionFact(transaction, "amount", amountForTrigger(transaction, trigger.amountSide))
          ])
        );
      }

      return suggestions;
    }

    case "duplicateReversalPair": {
      const suggestions: TaxSuggestion[] = [];
      const pairs = findDuplicateReversalPairs(index);

      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
        const pair = pairs[pairIndex];
        suggestions.push(
          createRuleSuggestion(
            rule,
            taxCase.id,
            `${rule.id}-${pairIndex + 1}`,
            [
              transactionFact(pair.debitTransaction, "debitTransaction", pair.debitTransaction.description),
              transactionFact(pair.creditTransaction, "creditTransaction", pair.creditTransaction.description),
              transactionFact(pair.debitTransaction, "amount", pair.debitTransaction.debit)
            ],
            pair.debitTransaction.debit,
            0.88
          )
        );
      }

      return suggestions;
    }

    case "businessProfile":
      if (!rule.trigger.turnoverBands.includes(taxCase.businessProfile.turnoverBand)) {
        return [];
      }

      return [
        createRuleSuggestion(
          rule,
          taxCase.id,
          `${rule.id}-${taxCase.id}`,
          [
            { field: "turnoverBand", value: taxCase.businessProfile.turnoverBand },
            { field: "legalName", value: taxCase.businessProfile.legalName }
          ],
          0,
          0.98
        )
      ];
  }
}

function buildReviewIndex(transactions: Transaction[]): ReviewIndex {
  const byCategory = new Map<TransactionCategory, IndexedTransaction[]>();
  const entries: IndexedTransaction[] = [];
  const debitEntries: IndexedTransaction[] = [];
  const creditEntries: IndexedTransaction[] = [];
  const reversalCreditEntries: IndexedTransaction[] = [];

  for (let order = 0; order < transactions.length; order += 1) {
    const transaction = transactions[order];
    const entry: IndexedTransaction = {
      transaction,
      normalizedDescription: transaction.description.toUpperCase(),
      order
    };

    entries.push(entry);
    if (transaction.debit > 0) {
      debitEntries.push(entry);
    }
    if (transaction.credit > 0) {
      creditEntries.push(entry);
      if (transaction.category === "reversal") {
        reversalCreditEntries.push(entry);
      }
    }

    const categoryEntries = byCategory.get(transaction.category);
    if (categoryEntries) {
      categoryEntries.push(entry);
    } else {
      byCategory.set(transaction.category, [entry]);
    }
  }

  return { entries, debitEntries, creditEntries, reversalCreditEntries, byCategory };
}

function selectEntriesByCategories(
  index: ReviewIndex,
  categories: TransactionCategory[]
): IndexedTransaction[] {
  const lists: IndexedTransaction[][] = [];
  const seenCategories = new Set<TransactionCategory>();

  for (const category of categories) {
    if (seenCategories.has(category)) {
      continue;
    }

    seenCategories.add(category);
    const list = index.byCategory.get(category);
    if (list && list.length > 0) {
      lists.push(list);
    }
  }

  if (lists.length === 0) {
    return [];
  }

  if (lists.length === 1) {
    return lists[0];
  }

  const positions = new Array<number>(lists.length).fill(0);
  const selected: IndexedTransaction[] = [];

  while (true) {
    let bestListIndex = -1;
    let bestOrder = Number.POSITIVE_INFINITY;

    for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
      const entry = lists[listIndex][positions[listIndex]];
      if (entry && entry.order < bestOrder) {
        bestOrder = entry.order;
        bestListIndex = listIndex;
      }
    }

    if (bestListIndex === -1) {
      break;
    }

    selected.push(lists[bestListIndex][positions[bestListIndex]]);
    positions[bestListIndex] += 1;
  }

  return selected;
}

function selectEntriesByAmountSide(index: ReviewIndex, amountSide: AmountSide): IndexedTransaction[] {
  if (amountSide === "credit") {
    return index.creditEntries;
  }

  if (amountSide === "debit") {
    return index.debitEntries;
  }

  return index.entries;
}

function groupSuggestionsBySeverity(firedSuggestions: TaxSuggestion[]) {
  const errors: TaxSuggestion[] = [];
  const warnings: TaxSuggestion[] = [];
  const suggestions: TaxSuggestion[] = [];

  for (const suggestion of firedSuggestions) {
    switch (suggestion.severity) {
      case "error":
        errors.push(suggestion);
        break;
      case "warning":
        warnings.push(suggestion);
        break;
      case "suggestion":
        suggestions.push(suggestion);
        break;
    }
  }

  return { errors, warnings, suggestions };
}

function createTransactionSuggestion(
  rule: TaxRuleConfig,
  caseId: string,
  transaction: Transaction,
  sourceFacts: SourceFact[]
): TaxSuggestion {
  return createRuleSuggestion(
    rule,
    caseId,
    `${rule.id}-${transaction.id}`,
    sourceFacts,
    transaction.debit > 0 ? transaction.debit : transaction.credit,
    Math.max(0.7, transaction.confidence)
  );
}

function createRuleSuggestion(
  rule: TaxRuleConfig,
  caseId: string,
  id: string,
  sourceFacts: SourceFact[],
  amountBasis: number,
  confidence: number
): TaxSuggestion {
  return {
    id,
    caseId,
    ruleId: rule.id,
    type: "deterministic_rule",
    severity: rule.severity,
    title: rule.title,
    rationale: `${rule.triggerDescription} Flagged automatically from your statement — your accountant confirms before filing.`,
    sourceFacts,
    evidenceRequired: rule.evidenceRequired,
    confidence: roundConfidence(confidence),
    estimatedTaxImpact: estimateImpact(rule, amountBasis),
    status: "open",
    userDecision: "pending"
  };
}

function estimateImpact(rule: TaxRuleConfig, amountBasis: number): EstimatedTaxImpact {
  const rate = rule.estimatedImpact.rate ?? 0;
  let amount = 0;

  switch (rule.estimatedImpact.method) {
    case "percentageOfDebit":
    case "percentageOfCredit":
      amount = amountBasis * rate;
      break;
    case "netOfWhtCredit":
      amount = rate > 0 && rate < 1 ? (amountBasis / (1 - rate)) * rate : 0;
      break;
    case "vatFractionFromGross":
      amount = rate > 0 ? amountBasis * (rate / (1 + rate)) : 0;
      break;
    case "none":
      amount = 0;
      break;
  }

  return {
    amount: Math.round(amount),
    currency: "NGN",
    estimateType: rule.estimatedImpact.estimateType,
    basis: rule.estimatedImpact.basis
  };
}

function matchesAmountSide(transaction: Transaction, amountSide: "debit" | "credit" | "either"): boolean {
  if (amountSide === "either") {
    return transaction.debit > 0 || transaction.credit > 0;
  }
  return transaction[amountSide] > 0;
}

function amountForTrigger(transaction: Transaction, amountSide: "debit" | "credit" | "either"): number {
  if (amountSide === "credit") {
    return transaction.credit;
  }
  if (amountSide === "debit") {
    return transaction.debit;
  }
  return Math.max(transaction.debit, transaction.credit);
}

function transactionFact(
  transaction: Transaction,
  field: string,
  value: string | number | boolean
): SourceFact {
  return {
    transactionId: transaction.id,
    field,
    value
  };
}

function findDuplicateReversalPairs(index: ReviewIndex): DuplicatePair[] {
  const creditQueues = buildCreditQueues(index.creditEntries);
  const reversalCreditQueues = buildCreditQueues(index.reversalCreditEntries);
  const pairs: DuplicatePair[] = [];
  const usedCreditIds = new Set<string>();

  for (const { transaction: debitTransaction } of index.debitEntries) {
    const queue = (
      debitTransaction.category === "reversal" ? creditQueues : reversalCreditQueues
    ).get(reversalPairKey(debitTransaction.date, debitTransaction.debit));
    const creditEntry = takeNextCredit(queue, usedCreditIds);

    if (creditEntry) {
      const creditTransaction = creditEntry.transaction;
      usedCreditIds.add(creditTransaction.id);
      pairs.push({ debitTransaction, creditTransaction });
    }
  }

  return pairs;
}

function buildCreditQueues(entries: IndexedTransaction[]): Map<string, DuplicateCreditQueue> {
  const queues = new Map<string, DuplicateCreditQueue>();

  for (const entry of entries) {
    const key = reversalPairKey(entry.transaction.date, entry.transaction.credit);
    const queue = queues.get(key);

    if (queue) {
      queue.entries.push(entry);
    } else {
      queues.set(key, { entries: [entry], cursor: 0 });
    }
  }

  return queues;
}

function takeNextCredit(
  queue: DuplicateCreditQueue | undefined,
  usedCreditIds: Set<string>
): IndexedTransaction | undefined {
  if (!queue) {
    return undefined;
  }

  while (queue.cursor < queue.entries.length) {
    const entry = queue.entries[queue.cursor];
    queue.cursor += 1;

    if (!usedCreditIds.has(entry.transaction.id)) {
      return entry;
    }
  }

  return undefined;
}

function reversalPairKey(date: string, amount: number): string {
  return `${date}\u0000${amount}`;
}

function roundConfidence(confidence: number): number {
  return Math.round(confidence * 100) / 100;
}
