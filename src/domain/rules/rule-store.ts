import type { RuleStore } from "@/adapters/contracts";
import { TaxRuleConfigListSchema } from "@/domain/schemas";
import type { TaxRuleConfig } from "@/domain/types";
import taxRulesJson from "@/data/tax-rules.json";

export class StaticJsonRuleStore implements RuleStore {
  async listRules(): Promise<TaxRuleConfig[]> {
    return TaxRuleConfigListSchema.parse(taxRulesJson);
  }
}

export function loadStaticTaxRules(): TaxRuleConfig[] {
  return TaxRuleConfigListSchema.parse(taxRulesJson);
}
