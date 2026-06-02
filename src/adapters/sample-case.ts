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
