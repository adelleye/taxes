"use client";

import { Download, FileCheck, Printer } from "lucide-react";
import { Button } from "@/components/Button";
import type { ReviewOutput, TaxCase, Transaction } from "@/domain/types";
import { buildTaxPack } from "@/domain/summary/tax-pack";

interface ExportActionsProps {
  taxCase: TaxCase;
  transactions: Transaction[];
  review: ReviewOutput;
  canExport: boolean;
  blockedLabel: string;
}

export function ExportActions({
  taxCase,
  transactions,
  review,
  canExport,
  blockedLabel
}: ExportActionsProps) {
  const exportJson = () => {
    const taxPack = buildTaxPack(taxCase, transactions, review);
    const blob = new Blob([JSON.stringify(taxPack, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, `${taxCase.id}-tax-pack.json`);
  };

  const openPrintableSummary = async () => {
    const printWindow = window.open("", "_blank");

    try {
      const response = await fetch("/api/export/html", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taxCase, transactions, review })
      });
      const html = await response.text();
      const blob = new Blob([html], { type: "text/html" });
      const href = URL.createObjectURL(blob);

      if (printWindow) {
        printWindow.location.href = href;
        window.setTimeout(() => URL.revokeObjectURL(href), 60000);
        return;
      }

      downloadBlob(blob, `${taxCase.id}-tax-pack.html`);
    } catch {
      printWindow?.close();
    }
  };

  return (
    <div className="export-grid">
      <div className="ecard">
        <span className="ecard-icon" aria-hidden="true">
          <Printer size={20} />
        </span>
        <h4>Printable summary</h4>
        <p>
          A clean one-page recap of the profile, totals and every review flag. Open it to print or
          save as PDF.
        </p>
        <Button
          type="button"
          variant="ghost"
          icon={<FileCheck size={16} aria-hidden="true" />}
          onClick={openPrintableSummary}
        >
          Open summary
        </Button>
      </div>
      <div className="ecard">
        <span className="ecard-icon" aria-hidden="true">
          <Download size={20} />
        </span>
        <h4>Export JSON</h4>
        <p>
          The full structured pack: profile, transactions, summary, suggestions and audit trail for
          accountant tools.
        </p>
        <Button
          type="button"
          variant="primary"
          icon={<Download size={16} aria-hidden="true" />}
          onClick={exportJson}
          disabled={!canExport}
        >
          {canExport ? "Download pack" : blockedLabel}
        </Button>
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
