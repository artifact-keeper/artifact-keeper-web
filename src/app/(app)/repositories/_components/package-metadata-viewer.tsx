"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Well-known metadata fields to display prominently. */
const HIGHLIGHTED_FIELDS: Record<string, string[]> = {
  npm: ["name", "version", "description", "license", "author", "homepage", "repository", "keywords", "engines"],
  pypi: ["name", "version", "summary", "license", "author", "home_page", "keywords", "requires_python", "classifiers"],
  cargo: ["name", "version", "description", "license", "authors", "repository", "keywords", "edition", "rust_version"],
  maven: ["groupId", "artifactId", "version", "packaging", "name", "description", "url", "licenses"],
  helm: ["name", "version", "description", "appVersion", "apiVersion", "type", "keywords", "home", "maintainers"],
  docker: ["architecture", "os", "config", "layers", "mediaType"],
  nuget: ["id", "version", "description", "authors", "license", "projectUrl", "tags"],
  rubygems: ["name", "version", "summary", "license", "authors", "homepage"],
  composer: ["name", "version", "description", "license", "authors", "type", "keywords"],
  go: ["module", "version", "sum"],
  protobuf: ["name", "version", "description", "owner", "files"],
};

function getTypeLabel(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array[${value.length}]`;
  return typeof value;
}

function getTypeColor(value: unknown): string {
  if (value === null || value === undefined) return "text-gray-400";
  if (typeof value === "string") return "text-green-600 dark:text-green-400";
  if (typeof value === "number") return "text-blue-600 dark:text-blue-400";
  if (typeof value === "boolean") return "text-amber-600 dark:text-amber-400";
  if (Array.isArray(value)) return "text-purple-600 dark:text-purple-400";
  return "text-muted-foreground";
}

function ValueDisplay({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic">null</span>;
  }
  if (typeof value === "boolean") {
    return (
      <Badge variant="outline" className="text-[10px] font-normal">
        {value ? "true" : "false"}
      </Badge>
    );
  }
  if (typeof value === "number") {
    return <span className="font-mono text-blue-600 dark:text-blue-400">{value}</span>;
  }
  if (typeof value === "string") {
    if (value.length > 120) {
      return (
        <span className="text-green-600 dark:text-green-400 break-all">
          &quot;{value.slice(0, 120)}&hellip;&quot;
        </span>
      );
    }
    // Check if it's a URL
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {value}
        </a>
      );
    }
    return (
      <span className="text-green-600 dark:text-green-400 break-all">
        &quot;{value}&quot;
      </span>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-400">[]</span>;
    // For simple string arrays, show inline
    if (value.every((v) => typeof v === "string") && value.length <= 5) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] font-normal">
              {String(v)}
            </Badge>
          ))}
        </div>
      );
    }
    return null; // Handled by CollapsibleValue
  }
  return null; // Objects handled by CollapsibleValue
}

function CollapsibleValue({
  label,
  value,
  defaultOpen = false,
  highlighted = false,
  depth = 0,
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
  highlighted?: boolean;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isComplex = (typeof value === "object" && value !== null);
  const isArray = Array.isArray(value);
  const simpleArrayInline = isArray && (value as unknown[]).every((v) => typeof v === "string") && (value as unknown[]).length <= 5;

  if (!isComplex || simpleArrayInline) {
    return (
      <div
        className={cn(
          "grid grid-cols-[minmax(120px,auto)_1fr] gap-x-3 gap-y-0.5 py-1 px-2 rounded text-xs",
          highlighted && "bg-muted/50",
          depth > 0 && "ml-4"
        )}
      >
        <span className="text-muted-foreground font-medium truncate">{label}</span>
        <div className="min-w-0">
          <ValueDisplay value={value} />
        </div>
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);

  return (
    <div className={cn(depth > 0 && "ml-4")}>
      <button
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 rounded hover:bg-muted/50 w-full text-left text-xs",
          highlighted && "bg-muted/50"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="size-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className={cn("text-[10px]", getTypeColor(value))}>
          {getTypeLabel(value)}
        </span>
      </button>
      {isOpen && (
        <div className="border-l border-muted ml-3 pl-1">
          {entries.map(([k, v]) => (
            <CollapsibleValue
              key={k}
              label={k}
              value={v}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PackageMetadataViewerProps {
  format: string;
  metadata?: Record<string, unknown>;
}

export function PackageMetadataViewer({ format, metadata }: PackageMetadataViewerProps) {
  const [copied, setCopied] = useState(false);

  if (!metadata || Object.keys(metadata).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No metadata available for this package.
        </p>
      </div>
    );
  }

  const highlightedKeys = new Set(HIGHLIGHTED_FIELDS[format] ?? []);
  const allKeys = Object.keys(metadata);
  const highlighted = allKeys.filter((k) => highlightedKeys.has(k));
  const other = allKeys.filter((k) => !highlightedKeys.has(k));

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(metadata, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {allKeys.length} field{allKeys.length !== 1 ? "s" : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1.5"
          onClick={handleCopyJson}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>

      {/* Highlighted fields first */}
      {highlighted.length > 0 && (
        <div className="space-y-0.5">
          {highlighted.map((key) => (
            <CollapsibleValue
              key={key}
              label={key}
              value={metadata[key]}
              highlighted
              defaultOpen={typeof metadata[key] !== "object" || metadata[key] === null}
            />
          ))}
        </div>
      )}

      {/* Separator if both sections exist */}
      {highlighted.length > 0 && other.length > 0 && (
        <div className="border-t pt-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Additional fields
          </span>
        </div>
      )}

      {/* Other fields */}
      {other.length > 0 && (
        <div className="space-y-0.5">
          {other.map((key) => (
            <CollapsibleValue
              key={key}
              label={key}
              value={metadata[key]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
