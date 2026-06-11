import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE } from "@/domain/case";
import { estimateProjectedTaxPosition, isSmallCompany } from "@/domain/summary/tax-position";
import type { BusinessProfile, Transaction, TransactionCategory } from "@/domain/types";

const SMALL_PROFILE: BusinessProfile = {
  ...EMPTY_PROFILE,
  turnoverBand: "NGN_25M_100M",
  fixedAssetsUnder250m: true
};

const STANDARD_PROFILE: BusinessProfile = {
  ...EMPTY_PROFILE,
  turnoverBand: "NGN_300M_1B"
};

describe("isSmallCompany", () => {
  it("requires BOTH the turnover band and the fixed-asset confirmation (NTA 2025)", () => {
    expect(isSmallCompany(SMALL_PROFILE)).toBe(true);
    expect(isSmallCompany({ ...SMALL_PROFILE, fixedAssetsUnder250m: false })).toBe(false);
    expect(isSmallCompany({ ...STANDARD_PROFILE, fixedAssetsUnder250m: true })).toBe(false);
  });
});

describe("estimateProjectedTaxPosition", () => {
  it("applies 30% CIT plus the 4% Development Levy to standard companies", () => {
    const position = estimateProjectedTaxPosition(
      [
        transaction("rev", "CUSTOMER PAYMENT INV-1", 0, 10000000, "revenue"),
        transaction("opex", "DIESEL", 2000000, 0, "operating_expense")
      ],
      STANDARD_PROFILE
    );

    expect(position.companySize).toBe("standard");
    expect(position.taxableProfitEstimate).toBe(8000000);
    expect(position.estimatedCit).toBe(2400000);
    expect(position.estimatedDevelopmentLevy).toBe(320000);
    expect(position.netAmount).toBe(2720000);
    expect(position.direction).toBe("payable");
    expect(position.rate).toBe(0.3);
    expect(position.developmentLevyRate).toBe(0.04);
  });

  it("applies the 0% small-company exemption when both NTA 2025 tests pass", () => {
    const position = estimateProjectedTaxPosition(
      [transaction("rev", "CUSTOMER PAYMENT INV-1", 0, 10000000, "revenue")],
      SMALL_PROFILE
    );

    expect(position.companySize).toBe("small");
    expect(position.estimatedCit).toBe(0);
    expect(position.estimatedDevelopmentLevy).toBe(0);
    expect(position.netAmount).toBe(0);
    expect(position.direction).toBe("neutral");
  });

  it("stays at standard rates while the fixed-asset test is unconfirmed — overestimate, never understate", () => {
    const position = estimateProjectedTaxPosition(
      [transaction("rev", "CUSTOMER PAYMENT INV-1", 0, 10000000, "revenue")],
      { ...SMALL_PROFILE, fixedAssetsUnder250m: false }
    );

    expect(position.companySize).toBe("standard");
    expect(position.estimatedCit).toBe(3000000);
    expect(position.estimatedDevelopmentLevy).toBe(400000);
  });

  it("turns withheld tax into a recoverable credit for an exempt small company", () => {
    const position = estimateProjectedTaxPosition(
      [transaction("rev", "CUSTOMER PAYMENT NET OF WHT INV-2", 0, 9500000, "revenue")],
      SMALL_PROFILE
    );

    // 9,500,000 / 0.95 * 0.05 — the gross invoice was 10m, 500k already sits with FIRS.
    expect(position.potentialWhtCredits).toBe(500000);
    expect(position.netAmount).toBe(-500000);
    expect(position.direction).toBe("credit");
  });
});

function transaction(
  id: string,
  description: string,
  debit: number,
  credit: number,
  category: TransactionCategory
): Transaction {
  return {
    id,
    caseId: "case-test",
    importId: "import-1",
    date: "2026-01-15",
    description,
    counterparty: "Counterparty Ltd",
    debit,
    credit,
    balance: 0,
    sourceAccount: "GTB-001",
    category,
    confidence: 0.9,
    reviewedByUser: false,
    evidenceStatus: "none"
  };
}
