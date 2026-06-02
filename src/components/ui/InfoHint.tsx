"use client";

import { Popover } from "@base-ui-components/react/popover";
import clsx from "clsx";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

interface InfoHintProps {
  /** Accessible label for the trigger, e.g. "How this estimate is calculated". */
  label: string;
  title?: string;
  children: ReactNode;
  /** Extra class on the trigger, used to theme the icon on dark surfaces. */
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * A small ⓘ affordance that reveals an explanation in a Base UI Popover.
 *
 * Lets us move jargon and detail out of the primary surface (keeping the UI
 * calm) while still close at hand. Opens on hover (desktop) and on click/tap +
 * focus (touch and keyboard), so it works everywhere. Origin-aware scale-in.
 */
export function InfoHint({ label, title, children, className, side = "top" }: InfoHintProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className={clsx("info-hint", className)}
        openOnHover
        delay={120}
      >
        <Info size={14} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="info-positioner" side={side} align="center" sideOffset={8}>
          <Popover.Popup className="info-popup">
            {title ? <Popover.Title className="info-title">{title}</Popover.Title> : null}
            <div className="info-body">{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
