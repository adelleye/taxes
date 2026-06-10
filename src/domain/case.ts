import type { BusinessProfile, TaxCase } from "@/domain/types";

/** A blank company profile — the user fills this in; nothing is pre-seeded. */
export const EMPTY_PROFILE: BusinessProfile = {
  legalName: "",
  rcNumber: "",
  taxId: "",
  state: "",
  entityType: "limited_company",
  accountingYearEnd: "12-31",
  turnoverBand: "NGN_300M_1B",
  fixedAssetsUnder250m: false,
  vatRegistered: false,
  hasEmployees: false,
  industry: ""
};

export function isBusinessProfileReady(profile: BusinessProfile): boolean {
  return Boolean(profile.legalName.trim() && profile.rcNumber.trim() && profile.taxId.trim());
}

/**
 * Creates the single local case that statements attach to. One case per browser
 * for now; this is the seam that becomes a server-issued case id in the cloud.
 */
export function createCase(profile: BusinessProfile, now = new Date()): TaxCase {
  const year = now.getUTCFullYear();
  return {
    id: "case-local",
    businessProfile: profile,
    yearStart: `${year}-01-01`,
    yearEnd: `${year}-12-31`,
    status: "transactions_imported",
    createdAt: now.toISOString()
  };
}
