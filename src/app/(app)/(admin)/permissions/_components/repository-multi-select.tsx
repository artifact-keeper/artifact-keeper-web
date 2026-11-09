"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface RepositoryOption {
  value: string;
  label: string;
}

interface RepositoryMultiSelectProps {
  options: RepositoryOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

export function RepositoryMultiSelect({
  options,
  selected,
  onChange,
  disabled,
}: RepositoryMultiSelectProps) {
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (value: string) =>
    onChange(
      selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );

  const allShownSelected = shown.length > 0 && shown.every((o) => selectedSet.has(o.value));

  return (
    <div className="space-y-2 rounded-md border p-2">
      <Input
        placeholder="Search repositories..."
        aria-label="Search repositories"
        value={search}
        disabled={disabled}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span aria-live="polite">{selected.length} selected</span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled || shown.length === 0 || allShownSelected}
            onClick={() =>
              onChange([...new Set([...selected, ...shown.map((o) => o.value)])])
            }
          >
            Select all shown
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled || selected.length === 0}
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto">
        <ul className="space-y-1 pr-2" aria-label="Repositories">
          {shown.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">No repositories match.</li>
          )}
          {shown.map((o) => (
            <li key={o.value} className="flex items-center gap-2">
              <Checkbox
                id={`repo-${o.value}`}
                checked={selectedSet.has(o.value)}
                disabled={disabled}
                onCheckedChange={() => toggle(o.value)}
              />
              <label
                htmlFor={`repo-${o.value}`}
                className="min-w-0 flex-1 cursor-pointer truncate text-sm"
                title={o.label}
              >
                {o.label}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
