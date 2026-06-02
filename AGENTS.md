# AGENTS.md — Nigeria Tax Workbench

You are building a lean internal tax workbench for a Nigerian CAC-registered company. Optimize for correctness, testability, and production-shaped interfaces over feature breadth.

## Non-negotiables
- Do not create a chatbot-first product.
- Do not let an LLM calculate tax or invent tax rules.
- Every tax suggestion must include: ruleId, sourceFacts, evidenceRequired, confidence, status, and userDecision.
- Dummy data must use the same TypeScript interfaces as future production adapters.
- Keep all tax rules in data/config where possible, not scattered in UI components.
- Build small vertical slices with tests.

## Product scope v0
- Upload/import bank-statement-like CSV or load seed transactions.
- Classify transactions into production categories.
- Let user confirm/edit classifications.
- Run deterministic review rules.
- Generate Errors, Warnings, Suggestions.
- Generate a tax-pack summary: revenue, expenses, VAT candidates, WHT candidates, payroll risk, capital asset candidates, missing evidence.
- Export JSON and printable HTML/PDF-ready summary.

## Out of scope v0
- Direct NRS/LIRS filing.
- Live bank connection.
- Payroll engine.
- Full audited financial statements.
- Multi-state tax allocation.
- Professional-service edge cases, petroleum, banking, insurance, free zones, transfer pricing.

## Quality bar
- TypeScript strict mode.
- Zod validate every import/API payload.
- Unit tests for classification rules, tax rules, and summary calculations.
- Include seed data and deterministic expected outputs.
- Run lint/typecheck/tests before claiming done.

## Done means
- User can create/load a case, import seed statement, review classifications, run review, see errors/warnings/suggestions, and export a tax pack.
- No tax suggestion appears without a ruleId and evidenceRequired.
- All mocked services implement the same interfaces as production adapters.
