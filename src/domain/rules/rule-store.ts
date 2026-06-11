import { TaxRuleConfigListSchema } from "@/domain/schemas";
import type { TaxRuleConfig } from "@/domain/types";
import taxRulesJson from "@/data/tax-rules.json";

export function loadStaticTaxRules(): TaxRuleConfig[] {
  return TaxRuleConfigListSchema.parse(taxRulesJson);
}
