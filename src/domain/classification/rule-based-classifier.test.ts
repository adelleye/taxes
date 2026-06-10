import { describe, expect, it } from "vitest";
import { classifyTransactionText } from "@/domain/classification/rule-based-classifier";
import { buildReviewedSeedFixture } from "@/domain/test-fixtures";

describe("RuleBasedClassifier", () => {
  it("classifies seeded transactions into production categories", () => {
    const { transactions } = buildReviewedSeedFixture();

    expect(transactions.map((transaction) => transaction.category)).toEqual([
      "revenue",
      "director_funding",
      "revenue",
      "operating_expense",
      "operating_expense",
      "payroll",
      "revenue",
      "capital_asset",
      "reversal",
      "reversal",
      "owner_drawings"
    ]);
  });

  it("matches keywords on word boundaries, not substrings", () => {
    // "PARENT" contains "RENT" — the original substring bug must not classify this as rent.
    expect(classifyTransactionText("PARENT COMPANY SETTLEMENT", 5000, 0).category).toBe(
      "uncategorized"
    );
    // This one DOES classify — but via the "ACCOUNT MAINTENANCE" bank-charge
    // phrase (0.9), not by "CURRENT" containing "RENT" (which would be 0.86).
    expect(classifyTransactionText("CURRENT ACCOUNT MAINTENANCE FEE", 5000, 0)).toEqual({
      category: "operating_expense",
      confidence: 0.9
    });
    // "PAYEE" contains "PAYE" — must not classify as payroll.
    expect(classifyTransactionText("TRANSFER TO PAYEE JOHN DOE", 250000, 0).category).toBe(
      "uncategorized"
    );
    // "CITIBANK" contains "CIT" — must not classify as a tax payment.
    expect(classifyTransactionText("CITIBANK TRANSFER TO ESCROW", 12000, 0).category).toBe(
      "uncategorized"
    );
    // Whole words and listed plurals still match.
    expect(classifyTransactionText("OFFICE RENT JANUARY", 2500000, 0).category).toBe(
      "operating_expense"
    );
    expect(classifyTransactionText("GENERATORS FOR SITE", 4000000, 0).category).toBe(
      "capital_asset"
    );
    expect(classifyTransactionText("CUSTOMER PAYMENT INV-1001", 0, 1000000).category).toBe(
      "revenue"
    );
  });

  it("does not treat bare bank-service VAT text as a tax remittance", () => {
    // Fee VAT is a deductible bank charge, never the company's own remittance.
    expect(classifyTransactionText("VALUE ADDED TAX FROM CORPORATE BRANCH", 1761.34, 0)).toEqual({
      category: "operating_expense",
      confidence: 0.9
    });
    expect(classifyTransactionText("FIRS VAT REMITTANCE MAY 2026", 500000, 0)).toEqual({
      category: "tax_payment",
      confidence: 0.88
    });
  });

  it("classifies real Nigerian bank-statement narrations", () => {
    // The micro-fee rows that dominate a real statement.
    expect(
      classifyTransactionText(
        "NIP TRANSFER COMMISSION 290025 TO GUARANTY TRUST BANK PLC | OKEKE NNAMDI CHINEDU /000023260406104221002207694444",
        50,
        0
      )
    ).toEqual({ category: "operating_expense", confidence: 0.9 });
    expect(
      classifyTransactionText("STAMP DUTY 290025 TO GUARANTY TRUST BANK PLC", 50, 0)
    ).toEqual({ category: "operating_expense", confidence: 0.9 });
    expect(classifyTransactionText("VAT ON NIP TRANSFER FEE", 3.75, 0)).toEqual({
      category: "operating_expense",
      confidence: 0.9
    });

    // Card purchases are presumed business expenses at lower confidence.
    expect(
      classifyTransactionText(
        "POINT OF SALE PURCHASE TRANSACTION WEB@<00000001> <DNH*GODADDY 480-505-8855 US>",
        42402,
        0
      )
    ).toEqual({ category: "operating_expense", confidence: 0.7 });
  });

  it("recognises Nigerian service vendors and professional fees as operating expenses", () => {
    expect(classifyTransactionText("TRANSFER TO HOST AFRICA WEB HOSTING RENEWAL", 85000, 0)).toEqual({
      category: "operating_expense",
      confidence: 0.75
    });
    // Contractors are services (operating expense), NOT payroll — payroll is
    // employees on PAYE.
    expect(classifyTransactionText("TECHNICAL FEE FEBRUARY OKAFOR J", 750000, 0)).toEqual({
      category: "operating_expense",
      confidence: 0.8
    });
  });

  it("presumes micro-debits are bank charges whatever the narration says", () => {
    expect(classifyTransactionText("PSC FEE 290025", 4, 0)).toEqual({
      category: "operating_expense",
      confidence: 0.6
    });
    // Above the micro limit, an unexplained debit still demands a human answer.
    expect(classifyTransactionText("PSC FEE 290025", 1001, 0).category).toBe("uncategorized");
  });

  it("presumes unmatched business-account credits are revenue, pending confirmation", () => {
    expect(
      classifyTransactionText(
        "INWARD TRANSFER (N) 496218 FROM ZENITH/ SKY CAPITAL AND FINANCIAL ALLIED IN-SKYPAY MAINTENANCE FEE",
        0,
        23575000
      )
    ).toEqual({ category: "revenue", confidence: 0.55 });

    // Unmatched debits stay uncategorized — money out must be explained, not presumed.
    expect(
      classifyTransactionText("OUTWARD TRANSFER (N) 1512228 TO ACCESS BANK NIGERIA LTD", 500000, 0)
    ).toEqual({ category: "uncategorized", confidence: 0.45 });
  });
});
