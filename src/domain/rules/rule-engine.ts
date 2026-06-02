import type {
  EstimatedTaxImpact,
  ReviewOutput,
  SourceFact,
  TaxCase,
  TaxRuleConfig,
  TaxSuggestion,
  Transaction
} from "@/domain/types";
import { ReviewOutputSchema } from "@/domain/schemas";
import { summarizeTaxPack } from "@/domain/summary/tax-pack";

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

export function runReviewEngine(input: ReviewEngineInput): ReviewOutput {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const firedSuggestions = input.rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) => fireRule(rule, input.taxCase, input.transactions));

  const summary = summarizeTaxPack(input.transactions, firedSuggestions);
  const output: ReviewOutput = {
    caseId: input.taxCase.id,
    generatedAt,
    errors: firedSuggestions.filter((suggestion) => suggestion.severity === "error"),
    warnings: firedSuggestions.filter((suggestion) => suggestion.severity === "warning"),
    suggestions: firedSuggestions.filter((suggestion) => suggestion.severity === "suggestion"),
    summary
  };

  return ReviewOutputSchema.parse(output);
}

function fireRule(
  rule: TaxRuleConfig,
  taxCase: TaxCase,
  transactions: Transaction[]
): TaxSuggestion[] {
  switch (rule.trigger.kind) {
    case "transactionCategory": {
      const trigger = rule.trigger;
      return transactions
        .filter((transaction) => trigger.categories.includes(transaction.category))
        .filter((transaction) => matchesAmountSide(transaction, trigger.amountSide))
        .map((transaction) =>
          createTransactionSuggestion(rule, taxCase.id, transaction, [
            transactionFact(transaction, "category", transaction.category),
            transactionFact(transaction, "description", transaction.description),
            transactionFact(transaction, "amount", amountForTrigger(transaction, trigger.amountSide))
          ])
        );
    }

    case "descriptionKeyword": {
      const trigger = rule.trigger;
      return transactions
        .filter((transaction) => matchesAmountSide(transaction, trigger.amountSide))
        .filter((transaction) =>
          trigger.keywords.some((keyword) =>
            transaction.description.toUpperCase().includes(keyword.toUpperCase())
          )
        )
        .map((transaction) =>
          createTransactionSuggestion(rule, taxCase.id, transaction, [
            transactionFact(transaction, "description", transaction.description),
            transactionFact(transaction, "credit", transaction.credit)
          ])
        );
    }

    case "missingEvidenceForCategories": {
      const trigger = rule.trigger;
      return transactions
        .filter((transaction) => trigger.categories.includes(transaction.category))
        .filter((transaction) => matchesAmountSide(transaction, trigger.amountSide))
        .filter((transaction) => amountForTrigger(transaction, trigger.amountSide) >= trigger.minimumAmount)
        .filter((transaction) => !trigger.acceptableEvidenceStatuses.includes(transaction.evidenceStatus))
        .map((transaction) =>
          createTransactionSuggestion(rule, taxCase.id, transaction, [
            transactionFact(transaction, "category", transaction.category),
            transactionFact(transaction, "evidenceStatus", transaction.evidenceStatus),
            transactionFact(transaction, "amount", amountForTrigger(transaction, trigger.amountSide))
          ])
        );
    }

    case "duplicateReversalPair":
      return findDuplicateReversalPairs(transactions).map((pair, index) =>
        createRuleSuggestion(
          rule,
          taxCase.id,
          `${rule.id}-${index + 1}`,
          [
            transactionFact(pair.debitTransaction, "debitTransaction", pair.debitTransaction.description),
            transactionFact(pair.creditTransaction, "creditTransaction", pair.creditTransaction.description),
            transactionFact(pair.debitTransaction, "amount", pair.debitTransaction.debit)
          ],
          pair.debitTransaction.debit,
          0.88
        )
      );

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
    rationale: `${rule.triggerDescription} This is a deterministic review flag and not autonomous tax advice.`,
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

function findDuplicateReversalPairs(transactions: Transaction[]): DuplicatePair[] {
  const debits = transactions.filter((transaction) => transaction.debit > 0);
  const credits = transactions.filter((transaction) => transaction.credit > 0);
  const pairs: DuplicatePair[] = [];
  const usedCreditIds = new Set<string>();

  for (const debitTransaction of debits) {
    const creditTransaction = credits.find(
      (candidate) =>
        !usedCreditIds.has(candidate.id) &&
        candidate.date === debitTransaction.date &&
        candidate.credit === debitTransaction.debit &&
        (candidate.category === "reversal" || debitTransaction.category === "reversal")
    );

    if (creditTransaction) {
      usedCreditIds.add(creditTransaction.id);
      pairs.push({ debitTransaction, creditTransaction });
    }
  }

  return pairs;
}

function roundConfidence(confidence: number): number {
  return Math.round(confidence * 100) / 100;
}
