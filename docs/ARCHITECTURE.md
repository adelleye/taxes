# Architecture — Nigeria Tax Workbench v0

## Principle
Mock now, production later, same contract always.

## Layers
Frontend
- Next.js pages/components.
- Case wizard, transaction review, review/optimize, summary/export.

API/Application
- CaseService
- TransactionImportService
- ClassificationService
- ReviewRuleEngine
- TaxSummaryService
- ExportService
- AuditLogService

Adapters
- StatementSource: MockCsvStatementSource now; BankApiStatementSource later.
- DocumentSource: MockEvidenceSource now; S3/Supabase later.
- Classifier: RuleBasedClassifier now; LLMClassifier later.
- RuleStore: StaticJsonRuleStore now; DB-backed RuleStore later.

Storage v0
- JSON files or SQLite.
- Never hard-code fake arrays inside React components.

## Data model
TaxCase
- id, businessProfile, yearStart, yearEnd, status, createdAt.

BusinessProfile
- legalName, rcNumber, taxId, state, entityType, accountingYearEnd, turnoverBand, vatRegistered, hasEmployees, industry.

Transaction
- id, caseId, date, description, counterparty, debit, credit, balance, sourceAccount, raw, category, confidence, reviewedByUser, evidenceIds.

Evidence
- id, caseId, type, fileName, linkedTransactionIds, status, extractedFields.

TaxRule
- id, title, taxArea, severity, trigger, evidenceRequired, sourceLabel, enabled.

Suggestion
- id, caseId, ruleId, type, severity, title, rationale, sourceFacts, evidenceRequired, confidence, estimatedTaxImpact, status, userDecision.

AuditEvent
- id, actor, action, entityType, entityId, before, after, timestamp.

## API endpoints
POST /api/cases
GET /api/cases/:id
POST /api/cases/:id/import-transactions
GET /api/cases/:id/transactions
PATCH /api/transactions/:id
POST /api/cases/:id/classify
POST /api/cases/:id/review
PATCH /api/suggestions/:id/decision
GET /api/cases/:id/export.json
GET /api/cases/:id/export.html

## Review engine contract
Input: confirmed transactions, evidence statuses, business profile, tax year.
Output: { errors: Suggestion[], warnings: Suggestion[], suggestions: Suggestion[], summary }

No suggestion may be emitted unless a rule fired and the output includes evidenceRequired.
