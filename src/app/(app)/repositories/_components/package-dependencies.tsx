"use client";

import {
  Package as PackageIcon,
  AlertCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Dependency {
  name: string;
  version: string;
  scope?: string;
}

/** Known metadata keys that contain dependency information, keyed by format. */
const DEP_EXTRACTORS: Record<string, (meta: Record<string, unknown>) => Dependency[]> = {
  npm: (m) => {
    const deps: Dependency[] = [];
    const add = (obj: unknown, scope: string) => {
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [name, ver] of Object.entries(obj as Record<string, string>)) {
          deps.push({ name, version: ver ?? "*", scope });
        }
      }
    };
    add(m.dependencies, "runtime");
    add(m.devDependencies ?? m.dev_dependencies, "dev");
    add(m.peerDependencies ?? m.peer_dependencies, "peer");
    add(m.optionalDependencies ?? m.optional_dependencies, "optional");
    return deps;
  },
  pypi: (m) => {
    const raw = m.requires_dist ?? m.dependencies;
    if (Array.isArray(raw)) {
      return raw.map((d: string) => {
        const parts = d.split(/[;(]/);
        const nameVer = (parts[0] ?? d).trim().split(/\s+/);
        return { name: nameVer[0], version: nameVer[1] ?? "*", scope: "runtime" };
      });
    }
    return [];
  },
  cargo: (m) => {
    const deps: Dependency[] = [];
    const add = (obj: unknown, scope: string) => {
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [name, val] of Object.entries(obj as Record<string, unknown>)) {
          const version = typeof val === "string" ? val : (val as Record<string, string>)?.version ?? "*";
          deps.push({ name, version, scope });
        }
      }
    };
    add(m.dependencies, "runtime");
    add(m.dev_dependencies ?? m.devDependencies, "dev");
    add(m.build_dependencies ?? m.buildDependencies, "build");
    return deps;
  },
  maven: (m) => {
    if (Array.isArray(m.dependencies)) {
      return (m.dependencies as Array<Record<string, string>>).map((d) => ({
        name: d.artifactId ?? d.name ?? "unknown",
        version: d.version ?? "*",
        scope: d.scope ?? "compile",
      }));
    }
    return [];
  },
  composer: (m) => {
    const deps: Dependency[] = [];
    const add = (obj: unknown, scope: string) => {
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [name, ver] of Object.entries(obj as Record<string, string>)) {
          deps.push({ name, version: ver ?? "*", scope });
        }
      }
    };
    add(m.require, "runtime");
    add(m.require_dev ?? m["require-dev"], "dev");
    return deps;
  },
  rubygems: (m) => {
    if (Array.isArray(m.dependencies)) {
      return (m.dependencies as Array<Record<string, string>>).map((d) => ({
        name: d.name ?? "unknown",
        version: d.version ?? d.requirements ?? "*",
        scope: d.type ?? "runtime",
      }));
    }
    return [];
  },
  nuget: (m) => {
    if (Array.isArray(m.dependencies)) {
      return (m.dependencies as Array<Record<string, string>>).map((d) => ({
        name: d.id ?? d.name ?? "unknown",
        version: d.version ?? "*",
        scope: d.targetFramework ?? "runtime",
      }));
    }
    return [];
  },
  helm: (m) => {
    if (Array.isArray(m.dependencies)) {
      return (m.dependencies as Array<Record<string, string>>).map((d) => ({
        name: d.name ?? "unknown",
        version: d.version ?? "*",
        scope: d.condition ? "conditional" : "runtime",
      }));
    }
    return [];
  },
};

const SCOPE_COLORS: Record<string, string> = {
  runtime: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  dev: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  peer: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  optional: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  build: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  compile: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  test: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  conditional: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
};

function extractDependencies(
  format: string,
  metadata?: Record<string, unknown>
): Dependency[] {
  if (!metadata) return [];

  // Try format-specific extractor first
  const extractor = DEP_EXTRACTORS[format];
  if (extractor) {
    const deps = extractor(metadata);
    if (deps.length > 0) return deps;
  }

  // Generic fallback: look for common dependency keys
  for (const key of ["dependencies", "requires", "deps"]) {
    const val = metadata[key];
    if (Array.isArray(val)) {
      return val.map((d) => {
        if (typeof d === "string") {
          const parts = d.split(/[@= ]+/);
          return { name: parts[0], version: parts[1] ?? "*", scope: "runtime" };
        }
        return {
          name: d.name ?? d.id ?? String(d),
          version: d.version ?? "*",
          scope: d.scope ?? "runtime",
        };
      });
    }
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.entries(val as Record<string, string>).map(([name, ver]) => ({
        name,
        version: typeof ver === "string" ? ver : "*",
        scope: "runtime",
      }));
    }
  }

  return [];
}

interface PackageDependenciesProps {
  format: string;
  metadata?: Record<string, unknown>;
}

export function PackageDependencies({ format, metadata }: PackageDependenciesProps) {
  const deps = extractDependencies(format, metadata);

  if (deps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No dependency information available
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Dependencies are extracted from package metadata when available.
        </p>
      </div>
    );
  }

  // Group by scope
  const scopes = [...new Set(deps.map((d) => d.scope ?? "runtime"))];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <PackageIcon className="size-4" />
        <span>
          {deps.length} dependenc{deps.length === 1 ? "y" : "ies"}
          {scopes.length > 1 && ` across ${scopes.length} scopes`}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Package</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Scope</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deps.map((dep, i) => (
            <TableRow key={`${dep.name}-${dep.scope}-${i}`}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <PackageIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{dep.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <code className="text-xs font-mono text-muted-foreground">
                  {dep.version}
                </code>
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={`text-[10px] font-normal ${SCOPE_COLORS[dep.scope ?? "runtime"] ?? ""}`}
                >
                  {dep.scope ?? "runtime"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
