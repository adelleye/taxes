"use client";

import clsx from "clsx";
import { Upload } from "lucide-react";
import { Button } from "@/components/Button";

interface StatementImportActionsProps {
  onUploadCsv: () => void;
  label?: string;
  isLoading?: boolean;
  className?: string;
}

export function StatementImportActions({
  onUploadCsv,
  label = "Upload bank statement",
  isLoading = false,
  className
}: StatementImportActionsProps) {
  return (
    <div className={clsx("import-actions", className)}>
      <Button
        type="button"
        variant="primary"
        icon={<Upload size={16} aria-hidden="true" />}
        disabled={isLoading}
        onClick={onUploadCsv}
      >
        {isLoading ? "Importing…" : label}
      </Button>
    </div>
  );
}
