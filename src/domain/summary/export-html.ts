import type { TaxPack, TaxSuggestion } from "@/domain/types";
import { formatMoney } from "@/lib/format";

export function renderTaxPackHtml(taxPack: TaxPack): string {
  const { taxCase, review } = taxPack;
  const allSuggestions = [
    ...review.errors,
    ...review.warnings,
    ...review.suggestions
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nigeria Tax Workbench - Tax Pack</title>
  <style>
    body { font-family: Arial, sans-serif; color: #17201b; margin: 40px; line-height: 1.45; }
    h1, h2 { margin: 0 0 12px; }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; margin-top: 28px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border: 1px solid #d9dedb; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f5f7f6; }
    .meta, .note { color: #536158; font-size: 13px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
    .summary div { border: 1px solid #d9dedb; padding: 10px; border-radius: 6px; }
    .label { color: #536158; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .value { font-size: 18px; font-weight: 700; }
    @media print { body { margin: 18mm; } .no-print { display: none; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">Print or save as PDF</button>
  <h1>Nigeria Tax Workbench Tax Pack</h1>
  <p class="meta">${escapeHtml(taxCase.businessProfile.legalName)} | ${escapeHtml(taxCase.businessProfile.rcNumber)} | ${escapeHtml(taxCase.yearStart)} to ${escapeHtml(taxCase.yearEnd)}</p>
  <p class="note">Deterministic review output only. This pack does not file taxes and does not provide autonomous tax advice.</p>

  <h2>Summary</h2>
  <section class="summary">
    <div><p class="label">Revenue</p><p class="value">${formatMoney(review.summary.revenue)}</p></div>
    <div><p class="label">Operating expenses</p><p class="value">${formatMoney(review.summary.operatingExpenses)}</p></div>
    <div><p class="label">Payroll</p><p class="value">${formatMoney(review.summary.payroll)}</p></div>
    <div><p class="label">Capital assets</p><p class="value">${formatMoney(review.summary.capitalAssets)}</p></div>
    <div><p class="label">Missing evidence</p><p class="value">${review.summary.missingEvidenceCount}</p></div>
    <div><p class="label">Review flags</p><p class="value">${allSuggestions.length}</p></div>
  </section>

  <h2>Errors, Warnings, Suggestions</h2>
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Rule</th>
        <th>Rationale</th>
        <th>Evidence required</th>
        <th>Impact</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${allSuggestions.map(renderSuggestionRow).join("")}
    </tbody>
  </table>

  <h2>Transactions</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Customer / supplier</th>
        <th>Debit</th>
        <th>Credit</th>
        <th>Category</th>
        <th>Evidence</th>
      </tr>
    </thead>
    <tbody>
      ${taxPack.transactions
        .map(
          (transaction) => `<tr>
        <td>${escapeHtml(transaction.date)}</td>
        <td>${escapeHtml(transaction.description)}</td>
        <td>${escapeHtml(formatCounterparty(transaction.counterparty))}</td>
        <td>${transaction.debit ? formatMoney(transaction.debit) : ""}</td>
        <td>${transaction.credit ? formatMoney(transaction.credit) : ""}</td>
        <td>${escapeHtml(transaction.category)}</td>
        <td>${escapeHtml(transaction.evidenceStatus)}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>
</body>
</html>`;
}

function renderSuggestionRow(suggestion: TaxSuggestion): string {
  return `<tr>
    <td>${escapeHtml(suggestion.severity)}</td>
    <td>${escapeHtml(suggestion.ruleId)}</td>
    <td>${escapeHtml(suggestion.rationale)}</td>
    <td>${suggestion.evidenceRequired.map(escapeHtml).join("<br />")}</td>
    <td>${formatMoney(suggestion.estimatedTaxImpact.amount)}<br /><span class="meta">${escapeHtml(suggestion.estimatedTaxImpact.estimateType)}</span></td>
    <td>${escapeHtml(suggestion.status)} / ${escapeHtml(suggestion.userDecision)}</td>
  </tr>`;
}

function formatCounterparty(counterparty: string): string {
  return counterparty.trim().toLowerCase() === "unknown" ? "Not shown by bank" : counterparty;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
