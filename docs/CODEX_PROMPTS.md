# Codex prompts

## Master prompt, under 4,000 characters
Build a lean internal SaaS proof-of-concept called Nigeria Tax Workbench. Use Next.js + TypeScript. The product is for a CAC-registered Nigerian company with ₦300m–₦1b turnover. It does NOT file taxes and does NOT give autonomous tax advice. It imports production-shaped bank-statement CSV data, classifies transactions, lets a user review/edit classifications, runs deterministic review rules, then shows Errors, Warnings, and Suggestions like Wealthsimple’s Review & Optimize pattern.

Constraints:
- Do not build a chatbot-first app.
- Do not call OpenAI in v0; create an adapter interface so an LLM classifier can be added later.
- Dummy data must use the exact same interfaces as future production sources. No fake arrays inside UI components.
- Every suggestion must include ruleId, rationale, sourceFacts, evidenceRequired, confidence, severity, estimatedTaxImpact, and status.
- Tax calculations are estimates and deterministic. LLMs must never calculate tax or invent law.
- Keep tax rules in JSON/config and run them through a rule engine.
- Add tests for import parsing, classification, rule firing, and summary output.

Implement vertical slice 1:
1. Case setup page.
2. Seed transaction import from /seed/sample-statement.csv.
3. Transaction review table with editable category and evidence status.
4. Review & Optimize button.
5. Results page with Errors, Warnings, Suggestions.
6. Export JSON and printable HTML summary.

Use AGENTS.md as binding repo guidance. Before coding, produce a short plan with files to create/edit and acceptance checks. Done when npm test/typecheck pass and a user can load the sample case, review transactions, run rules, and export the tax pack.

## Backend prompt
Implement the backend/application layer only. Create TypeScript types, Zod schemas, CSV parser, mock statement adapter, rule store, deterministic rule engine, summary service, and tests. Do not create UI except minimal API route handlers. No OpenAI calls. Use seed files and expected outputs.

## Frontend prompt
Implement the UI only against existing API contracts. Keep UI simple like Wealthsimple: left-side stepper, clean forms, review table, Review & Optimize CTA, result cards for Errors/Warnings/Suggestions, and summary/export page. Do not embed fake data inside components.

## Review prompt
Review this repo for over-engineering, hallucinated tax logic, fake data that is not production-shaped, missing tests, and places where an LLM is allowed to decide tax treatment. Produce a prioritized fix list and patch the top issues.
