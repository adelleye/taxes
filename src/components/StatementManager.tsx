"use client";

import { Trash2, Upload, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/Button";
import { summarizeStatements } from "@/domain/import/statements";
import type { Transaction } from "@/domain/types";

interface StatementManagerProps {
  transactions: Transaction[];
  onUploadCsv: () => void;
  onRemoveStatement: (importId: string) => void;
  onClearAll: () => void;
  isLoading?: boolean;
}

export function StatementManager({
  transactions,
  onUploadCsv,
  onRemoveStatement,
  onClearAll,
  isLoading = false
}: StatementManagerProps) {
  const statements = useMemo(() => summarizeStatements(transactions), [transactions]);

  return (
    <div className="statement-manager">
      <ul className="statement-chips" aria-label="Imported statements">
        {statements.map((statement) => {
          // Bullets instead of the bank's asterisk masking: * rides above the
          // text baseline and makes the chip look misaligned.
          const label = (statement.sourceAccounts.join(", ") || "Statement").replace(/\*/g, "•");
          return (
            <li
              key={statement.importId}
              className="statement-chip"
              title={`${statement.count} transactions · ${statement.startDate} to ${statement.endDate}`}
            >
              <span className="sc-name">{label}</span>
              <span className="sc-count num">{statement.count}</span>
              <button
                type="button"
                className="sc-remove"
                aria-label={`Remove ${label} statement`}
                onClick={() => onRemoveStatement(statement.importId)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="statement-manager-actions">
        <Button
          type="button"
          variant="primary"
          icon={<Upload size={16} aria-hidden="true" />}
          disabled={isLoading}
          onClick={onUploadCsv}
        >
          {isLoading ? "Importing…" : "Add statement"}
        </Button>
        <Button type="button" variant="ghost" icon={<Trash2 size={16} aria-hidden="true" />} onClick={onClearAll}>
          Clear all
        </Button>
      </div>
    </div>
  );
}
