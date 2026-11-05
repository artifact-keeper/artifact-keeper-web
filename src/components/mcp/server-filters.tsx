"use client";

import type { ReactNode } from "react";
import { LayoutGrid, LayoutList, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MCP_SEARCH_MIN_CHARS } from "@/lib/api/mcp";
import { officialMeta } from "@/lib/mcp/server-json";
import type { McpServedEntry } from "@/types/mcp";

/**
 * Filters shared by the repository Servers gallery and the cross-repository
 * catalog. Search goes to the registry (it needs 3 characters); transport,
 * package type and status are applied to the loaded entries because the
 * registry API has no parameters for them.
 */
export interface McpServerFilters {
  search: string;
  transport: "all" | "stdio" | "streamable-http" | "sse";
  packageType: "all" | "npm" | "pypi" | "oci" | "nuget" | "cargo" | "mcpb";
  status: "active" | "deprecated" | "all";
}

export type McpGalleryView = "grid" | "list";

export const DEFAULT_MCP_FILTERS: McpServerFilters = {
  search: "",
  transport: "all",
  packageType: "all",
  status: "active",
};

const TRANSPORTS: { value: McpServerFilters["transport"]; label: string }[] = [
  { value: "all", label: "All transports" },
  { value: "stdio", label: "stdio" },
  { value: "streamable-http", label: "http" },
  { value: "sse", label: "sse" },
];

const PACKAGE_TYPES: { value: McpServerFilters["packageType"]; label: string }[] = [
  { value: "all", label: "All package types" },
  { value: "npm", label: "npm" },
  { value: "pypi", label: "pypi" },
  { value: "oci", label: "oci" },
  { value: "nuget", label: "nuget" },
  { value: "cargo", label: "cargo" },
  { value: "mcpb", label: "mcpb" },
];

const STATUSES: { value: McpServerFilters["status"]; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "deprecated", label: "Deprecated" },
  { value: "all", label: "All statuses" },
];

/** The search actually sent: trimmed, and only once it is long enough. */
export function effectiveMcpSearch(search: string): string {
  const s = search.trim();
  return s.length >= MCP_SEARCH_MIN_CHARS ? s : "";
}

/** Whether anything narrows the list (for the "No servers match" state). */
export function hasActiveMcpFilters(f: McpServerFilters): boolean {
  return (
    effectiveMcpSearch(f.search) !== "" ||
    f.transport !== DEFAULT_MCP_FILTERS.transport ||
    f.packageType !== DEFAULT_MCP_FILTERS.packageType ||
    f.status !== DEFAULT_MCP_FILTERS.status
  );
}

function transportsOfEntry(e: McpServedEntry): string[] {
  return [
    ...(e.server.packages ?? []).map((p) => p.transport?.type ?? "stdio"),
    ...(e.server.remotes ?? []).map((r) => r.type),
  ];
}

/** Apply the client-side filters (search is already applied by the registry). */
export function filterMcpServers(entries: McpServedEntry[], f: McpServerFilters): McpServedEntry[] {
  return entries.filter((e) => {
    const status = officialMeta(e)?.status ?? "active";
    if (f.status !== "all" && status !== f.status) return false;
    if (f.transport !== "all" && !transportsOfEntry(e).includes(f.transport)) return false;
    if (f.packageType !== "all" && !(e.server.packages ?? []).some((p) => p.registryType === f.packageType)) {
      return false;
    }
    return true;
  });
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger aria-label={label} size="sm" className="w-auto">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function McpServerFilterBar({
  filters,
  onChange,
  view,
  onViewChange,
  extra,
}: {
  filters: McpServerFilters;
  onChange: (f: McpServerFilters) => void;
  view: McpGalleryView;
  onViewChange: (v: McpGalleryView) => void;
  /** Extra controls (the catalog's repository filter). */
  extra?: ReactNode;
}) {
  const trimmed = filters.search.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MCP_SEARCH_MIN_CHARS;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search servers"
            aria-describedby={tooShort ? "mcp-search-hint" : undefined}
            placeholder="Search servers..."
            className="pl-8"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
          />
        </div>
        <FilterSelect
          label="Transport"
          value={filters.transport}
          options={TRANSPORTS}
          onChange={(transport) => onChange({ ...filters, transport })}
        />
        <FilterSelect
          label="Package type"
          value={filters.packageType}
          options={PACKAGE_TYPES}
          onChange={(packageType) => onChange({ ...filters, packageType })}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          options={STATUSES}
          onChange={(status) => onChange({ ...filters, status })}
        />
        {extra}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => onViewChange("list")}
          >
            <LayoutList className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => onViewChange("grid")}
          >
            <LayoutGrid className="size-3.5" />
          </Button>
        </div>
      </div>
      {tooShort && (
        <p id="mcp-search-hint" className="text-xs text-muted-foreground">
          Type at least {MCP_SEARCH_MIN_CHARS} characters to search.
        </p>
      )}
    </div>
  );
}

/** Grid or list container for server cards. */
export function McpServerGrid({ view, children }: { view: McpGalleryView; children: ReactNode }) {
  return (
    <div
      data-testid="mcp-server-grid"
      data-view={view}
      className={view === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-2"}
    >
      {children}
    </div>
  );
}

/** `repoKey\u0000name` -> package id, from catalog rows. */
export function packageIdIndex(
  packages: { id: string; name: string; repository_key: string }[] | undefined,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of packages ?? []) m.set(`${p.repository_key}\u0000${p.name}`, p.id);
  return m;
}

export function packageIdOf(index: Map<string, string>, repoKey: string, name: string): string | undefined {
  return index.get(`${repoKey}\u0000${name}`);
}
