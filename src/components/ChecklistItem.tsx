"use client";

import clsx from "clsx";
import { Check, CircleDashed, X } from "lucide-react";
import type { ReactNode } from "react";

export type ChecklistStatus = "complete" | "blocked" | "pending";

export function ChecklistItem({
  status,
  label,
  children
}: {
  status: ChecklistStatus;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="cl-row" role="listitem">
      <span
        className={clsx(
          "cl-icon",
          status === "complete" && "ok",
          status === "blocked" && "no",
          status === "pending" && "pending"
        )}
        aria-hidden="true"
      >
        {status === "complete" ? (
          <Check strokeWidth={3} />
        ) : status === "blocked" ? (
          <X strokeWidth={3} />
        ) : (
          <CircleDashed strokeWidth={2.4} />
        )}
      </span>
      <div>
        <div className="cl-title">{label}</div>
        <div className="cl-desc">{children}</div>
      </div>
    </div>
  );
}
