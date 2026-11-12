"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** The sentinel for "no filter", matching the scan-results status select. */
export const FILTER_ALL = "__all__";

/** Sentence-case a raw enum value, so the trigger reads "Pending" not "pending". */
function optionLabel(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A labelled filter dropdown, styled like the ones in Curation and Scan
 * Results. `undefined` is the unfiltered state; the sentinel only exists
 * because Radix cannot hold an empty-string value.
 */
export function FilterSelect<T extends string>({
  label,
  options,
  active,
  onSelect,
  labels,
  allLabel,
  disabled,
  disabledReason,
  className = "w-40",
}: Readonly<{
  label: string;
  options: readonly T[];
  active?: T;
  onSelect: (value?: T) => void;
  labels?: Record<string, string>;
  allLabel?: string;
  /** Greys the control out but keeps its space, so the toolbar cannot reflow. */
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}>) {
  return (
    <Select
      value={active ?? FILTER_ALL}
      disabled={disabled}
      onValueChange={(v) => onSelect(v === FILTER_ALL ? undefined : (v as T))}
    >
      <SelectTrigger
        className={className}
        aria-label={`${label} filter`}
        title={disabled ? disabledReason : undefined}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FILTER_ALL}>{allLabel ?? `All ${label}`}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {labels?.[opt] ?? optionLabel(opt)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
