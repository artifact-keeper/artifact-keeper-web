"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIONS,
  PRINCIPAL_TYPES,
  TARGET_TYPES,
  hasActiveFilters,
  type PermissionFilters,
} from "@/lib/permission-filters";

const ANY = "__any__";

const PRINCIPAL_LABELS: Record<(typeof PRINCIPAL_TYPES)[number], string> = {
  user: "User",
  group: "Group",
  service_account: "Service account",
};

interface PermissionFilterBarProps {
  filters: PermissionFilters;
  onChange: (filters: PermissionFilters) => void;
  shown: number;
  total: number;
}

export function PermissionFilterBar({ filters, onChange, shown, total }: PermissionFilterBarProps) {
  const set = <K extends keyof PermissionFilters>(key: K, value: PermissionFilters[K]) =>
    onChange({ ...filters, [key]: value });
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter permissions">
      <Select
        value={filters.principalType || ANY}
        onValueChange={(v) => set("principalType", v === ANY ? "" : (v as PermissionFilters["principalType"]))}
      >
        <SelectTrigger className="h-8 w-40" aria-label="Principal type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any principal type</SelectItem>
          {PRINCIPAL_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {PRINCIPAL_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 w-48"
        placeholder="Principal name..."
        aria-label="Search principal"
        value={filters.principal}
        onChange={(e) => set("principal", e.target.value)}
      />
      <Select
        value={filters.targetType || ANY}
        onValueChange={(v) => set("targetType", v === ANY ? "" : (v as PermissionFilters["targetType"]))}
      >
        <SelectTrigger className="h-8 w-36" aria-label="Target type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any target type</SelectItem>
          {TARGET_TYPES.map((t) => (
            <SelectItem key={t} value={t} className="capitalize">
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 w-48"
        placeholder="Target name..."
        aria-label="Search target"
        value={filters.target}
        onChange={(e) => set("target", e.target.value)}
      />
      <Select
        value={filters.action || ANY}
        onValueChange={(v) => set("action", v === ANY ? "" : (v as PermissionFilters["action"]))}
      >
        <SelectTrigger className="h-8 w-32" aria-label="Action">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any action</SelectItem>
          {ACTIONS.map((a) => (
            <SelectItem key={a} value={a} className="capitalize">
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({ principalType: "", principal: "", targetType: "", target: "", action: "" })
            }
          >
            <X className="size-4" />
            Clear filters
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {shown} of {total}
          </span>
        </>
      )}
    </div>
  );
}
