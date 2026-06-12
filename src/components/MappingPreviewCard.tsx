"use client";

import { Button } from "@/components/Button";
import type { ColumnMapping, ImportAmountMode, ImportPreview } from "@/domain/import/csv";

export interface PendingStatementImport {
  csvText: string;
  fileName: string;
  preview: ImportPreview;
  mapping: ColumnMapping;
}

export function initialMappingFromPreview(preview: ImportPreview): ColumnMapping {
  return (
    preview.mapping ?? {
      date: "",
      description: "",
      debit: "",
      credit: "",
      balance: "",
      counterparty: "",
      sourceAccount: "",
      reference: "",
      dateFormat: "unknown",
      amountMode: "debit_credit_columns"
    }
  );
}

export function MappingPreviewCard({
  pendingImport,
  preview,
  onMappingChange,
  onConfirm,
  onCancel
}: {
  pendingImport: PendingStatementImport;
  preview: ImportPreview;
  onMappingChange: (patch: Partial<ColumnMapping>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const headers = preview.headers.length > 0 ? preview.headers : pendingImport.preview.headers;
  const mapping = pendingImport.mapping;
  const canConfirm = preview.status === "ready" && preview.rows.length > 0;

  return (
    <div className="mapping-card">
      <div className="mapping-head">
        <div>
          <h4>Confirm statement columns</h4>
          <p>We found a bank statement, but need you to confirm how its columns map to transactions.</p>
        </div>
        <span className="mapping-file">{pendingImport.fileName}</span>
      </div>

      <div className="mapping-grid">
        <MappingSelect
          label="Date column"
          headers={headers}
          value={mapping.date}
          onChange={(date) => onMappingChange({ date })}
        />
        <MappingSelect
          label="Description/narration"
          headers={headers}
          value={mapping.description}
          onChange={(description) => onMappingChange({ description })}
        />
        <label>
          <span className="field-label">Amount mode</span>
          <select
            className="input"
            value={mapping.amountMode}
            onChange={(event) => onMappingChange({ amountMode: event.target.value as ImportAmountMode })}
          >
            <option value="debit_credit_columns">Debit + credit columns</option>
            <option value="signed_amount">Signed amount</option>
            <option value="money_in_money_out">Money in + money out</option>
          </select>
        </label>
        <label>
          <span className="field-label">Date format</span>
          <select
            className="input"
            value={mapping.dateFormat ?? "unknown"}
            onChange={(event) =>
              onMappingChange({ dateFormat: event.target.value as NonNullable<ColumnMapping["dateFormat"]> })
            }
          >
            <option value="unknown">Auto detect</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="DD-MM-YYYY">DD-MM-YYYY</option>
          </select>
        </label>

        {mapping.amountMode === "debit_credit_columns" ? (
          <>
            <MappingSelect
              label="Debit column"
              headers={headers}
              value={mapping.debit ?? ""}
              onChange={(debit) => onMappingChange({ debit })}
            />
            <MappingSelect
              label="Credit column"
              headers={headers}
              value={mapping.credit ?? ""}
              onChange={(credit) => onMappingChange({ credit })}
            />
          </>
        ) : null}

        {mapping.amountMode === "signed_amount" ? (
          <MappingSelect
            label="Amount column"
            headers={headers}
            value={mapping.amount ?? ""}
            onChange={(amount) => onMappingChange({ amount })}
          />
        ) : null}

        {mapping.amountMode === "money_in_money_out" ? (
          <>
            <MappingSelect
              label="Money in column"
              headers={headers}
              value={mapping.moneyIn ?? ""}
              onChange={(moneyIn) => onMappingChange({ moneyIn })}
            />
            <MappingSelect
              label="Money out column"
              headers={headers}
              value={mapping.moneyOut ?? ""}
              onChange={(moneyOut) => onMappingChange({ moneyOut })}
            />
          </>
        ) : null}

        <MappingSelect
          label="Balance column"
          headers={headers}
          value={mapping.balance ?? ""}
          optional
          onChange={(balance) => onMappingChange({ balance: balance || undefined })}
        />
        <MappingSelect
          label="Customer / supplier column"
          headers={headers}
          value={mapping.counterparty ?? ""}
          optional
          onChange={(counterparty) => onMappingChange({ counterparty: counterparty || undefined })}
        />
        <MappingSelect
          label="Reference column"
          headers={headers}
          value={mapping.reference ?? ""}
          optional
          onChange={(reference) => onMappingChange({ reference: reference || undefined })}
        />
      </div>

      <div className="mapping-summary">
        <span>
          {preview.reconciliation.transactionCount} rows detected · {preview.reconciliation.skippedCount} row
          {preview.reconciliation.skippedCount === 1 ? "" : "s"} skipped
        </span>
        {preview.message ? <span>{preview.message}</span> : null}
      </div>

      <div className="mapping-preview">
        {preview.previewRows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="right">Amount</th>
                <th className="right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {preview.previewRows.map((row) => (
                <tr key={`${row.originalRowNumber}-${row.date}-${row.description}`}>
                  <td className="num">{row.date}</td>
                  <td>{row.description}</td>
                  <td className={row.debit > 0 ? "right neg num" : "right num"}>
                    {formatImportAmount(row.credit > 0 ? row.credit : -row.debit)}
                  </td>
                  <td className="right num">{row.balance ? formatImportAmount(row.balance) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mapping-empty">No preview rows yet.</div>
        )}
      </div>

      {preview.rowIssues.length > 0 ? (
        <ul className="mapping-issues">
          {preview.rowIssues.slice(0, 4).map((issue) => (
            <li key={`${issue.rowNumber}-${issue.message}`}>
              Row {issue.rowNumber}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mapping-actions">
        <Button type="button" variant="primary" disabled={!canConfirm} onClick={onConfirm}>
          Import statement
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function MappingSelect({
  label,
  headers,
  value,
  onChange,
  optional = false
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{optional ? "Not mapped" : "Choose column"}</option>
        {headers.map((header) =>
          header ? (
            <option key={header} value={header}>
              {header}
            </option>
          ) : null
        )}
      </select>
    </label>
  );
}

function formatImportAmount(value: number): string {
  return `₦${Math.abs(value).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
