"use client";

import { Select as BaseSelect } from "@base-ui-components/react/select";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { useMemo, type ReactNode } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** One plain-language line under the label, for users without a finance background. */
  description?: string;
}

interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: ReadonlyArray<SelectOption<T>>;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  /** Extra class on the trigger button (e.g. `filter-trigger`, `table-trigger`). */
  className?: string;
  /** Optional element rendered at the start of the trigger, e.g. a category dot. */
  startSlot?: ReactNode;
}

/**
 * A single-value picker built on Base UI's Select.
 *
 * Replaces the native <select> so the popup can be styled, animated, and made
 * origin-aware: it scales in from the trigger via `--transform-origin`
 * (Emil Kowalski's dropdown tip) with `ease-out`, and out a touch faster.
 * `modal={false}` keeps it light — no scroll lock, no scrollbar layout shift.
 */
export function Select<T extends string>({
  value,
  onValueChange,
  items,
  id,
  ariaLabel,
  placeholder,
  className,
  startSlot
}: SelectProps<T>) {
  const labelByValue = useMemo(() => new Map(items.map((item) => [item.value, item.label])), [items]);

  return (
    <BaseSelect.Root
      items={items as Array<{ value: T; label: string }>}
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      modal={false}
    >
      <BaseSelect.Trigger id={id} aria-label={ariaLabel} className={clsx("select-trigger", className)}>
        {startSlot}
        <BaseSelect.Value className="select-value">
          {(selected: T) => labelByValue.get(selected) ?? placeholder ?? ""}
        </BaseSelect.Value>
        <BaseSelect.Icon className="select-chevron">
          <ChevronDown size={16} aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="select-positioner"
          side="bottom"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className="select-popup">
            <BaseSelect.List className="select-list">
              {items.map((item) => (
                <BaseSelect.Item key={item.value} value={item.value} className="select-item">
                  <span className="select-item-check" aria-hidden="true">
                    <BaseSelect.ItemIndicator>
                      <Check size={14} />
                    </BaseSelect.ItemIndicator>
                  </span>
                  <BaseSelect.ItemText className="select-item-text">
                    {item.label}
                    {item.description ? (
                      <span className="select-item-desc">{item.description}</span>
                    ) : null}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
