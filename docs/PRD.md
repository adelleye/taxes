# PRD — Nigeria Tax Workbench v0

## Goal
Build the leanest useful internal SaaS proof-of-concept for a CAC-registered Nigerian company with annual revenue around ₦300m–₦1b. The product turns bank statement data into a reviewable business tax pack and surfaces evidence-backed tax optimization suggestions.

## Target user
Internal finance/tax operator or accountant preparing company tax review materials.

## Core job
"Help me find what in our bank/account data affects tax, what evidence is missing, what credits/deductions may be available, and what needs accountant review."

## MVP user flow
1. Create tax case.
2. Enter business profile: legal name, RC/CAC number, Tax ID, accounting year, turnover estimate, VAT registered?, PAYE employees?, industry.
3. Import seed or CSV bank transactions.
4. System classifies transactions.
5. User reviews and corrects classifications.
6. User attaches/marks evidence status.
7. Click Review & Optimize.
8. System returns Errors, Warnings, Suggestions.
9. User accepts/rejects/needs-review for each suggestion.
10. Export tax pack summary.

## MVP features
- Case setup wizard.
- CSV transaction import.
- Transaction table with filters and inline category editing.
- Evidence status: none, available, uploaded, not applicable.
- Rule engine with deterministic suggestions.
- Summary dashboard.
- Export JSON and printable HTML.

## MVP review rules
1. Possible non-revenue inflow.
2. Uncategorized business expense.
3. Possible WHT credit.
4. VAT input candidate.
5. Capital asset candidate.
6. Payroll/PAYE risk.
7. Missing evidence on material expense.
8. Standard-company scope check: turnover above small-company threshold.
9. Duplicate/reversal candidate.
10. Tax-pack completeness check.

## Out of scope
- Direct filing to NRS/LIRS.
- CRA/Wealthsimple-like government autofill.
- Legal advice or guaranteed tax savings.
- Live bank API.
- Full CIT computation for final filing.
- Multi-year tax planning.

## Success metrics
- 95% of transactions are importable without schema errors.
- 80% of seeded transaction categories match expected classifications.
- 100% of suggestions have ruleId + evidenceRequired.
- Export contains profile, transaction summaries, suggestions, and audit trail.
