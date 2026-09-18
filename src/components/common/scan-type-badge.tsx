import { createElement } from "react";
import {
  Boxes,
  Bug,
  ClipboardCheck,
  Container,
  FolderSearch,
  Scale,
  ScanLine,
  Server,
  ShieldAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The `scan_type` values the backend stores and accepts on `?scan_type=`
 * (`KNOWN_SCAN_TYPES` in `handlers/security.rs`, backend 1.10.0 —
 * artifact-keeper#3410 for the filter, #3411 for `external`). Listed in the
 * order the scan-type filter offers them.
 */
export const SCAN_TYPES = [
  "dependency",
  "image",
  "license",
  "malware",
  "filesystem",
  "grype",
  "openscap",
  "incus",
  "external",
] as const;

export type ScanType = (typeof SCAN_TYPES)[number];

/**
 * The scan type written for findings ingested through
 * `POST /security/findings/external`. Generic, never per-vendor: the vendor is
 * on each finding's `source`, and its build/database version on the scan's
 * `scanner_version`.
 */
export const EXTERNAL_SCAN_TYPE = "external";

const SCAN_TYPE_CONFIG: Record<ScanType, { label: string; icon: LucideIcon }> = {
  dependency: { label: "Dependency", icon: Boxes },
  image: { label: "Container Image", icon: Container },
  license: { label: "License", icon: Scale },
  malware: { label: "Malware", icon: ShieldAlert },
  filesystem: { label: "Filesystem", icon: FolderSearch },
  grype: { label: "Grype", icon: Bug },
  openscap: { label: "OpenSCAP", icon: ClipboardCheck },
  incus: { label: "Incus", icon: Server },
  external: { label: "External", icon: Upload },
};

function isKnownScanType(value: string): value is ScanType {
  return value in SCAN_TYPE_CONFIG;
}

/**
 * Human-readable label for a `scan_results.scan_type` value.
 *
 * An unrecognized value is returned unchanged rather than replaced by a
 * placeholder: a scan type the web doesn't model yet must still be readable
 * (and searchable) in the table it appears in.
 */
export function scanTypeLabel(scanType: string): string {
  return isKnownScanType(scanType) ? SCAN_TYPE_CONFIG[scanType].label : scanType;
}

/** Icon for a `scan_type`, falling back to a generic scan glyph. */
export function scanTypeIcon(scanType: string): LucideIcon {
  return isKnownScanType(scanType) ? SCAN_TYPE_CONFIG[scanType].icon : ScanLine;
}

/**
 * Tooltip text for a scan type. `external` gets an explanation rather than a
 * restatement of the label: "External" alone doesn't tell the reader that the
 * vendor identity is one column over, on each finding's Source.
 */
function scanTypeTitle(scanType: string, scannerVersion?: string | null): string {
  const base =
    scanType === EXTERNAL_SCAN_TYPE
      ? "Findings ingested from a scanner outside this registry — the vendor is on each finding's Source."
      : `${scanTypeLabel(scanType)} scan`;
  return scannerVersion ? `${base} (scanner ${scannerVersion})` : base;
}

interface ScanTypeBadgeProps {
  /** Raw `scan_results.scan_type` from the API. */
  scanType: string;
  /** Raw `scan_results.scanner_version`; surfaced in the tooltip when present. */
  scannerVersion?: string | null;
  className?: string;
}

/**
 * Renders a `scan_type` as an icon + label badge.
 *
 * Every scan table used to print `scan_type` raw, so the `external` rows
 * backend 1.10.0 introduced showed up as a bare "external" with no indication
 * of what they were (#858).
 */
export function ScanTypeBadge({
  scanType,
  scannerVersion,
  className,
}: ScanTypeBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 text-xs font-normal", className)}
      title={scanTypeTitle(scanType, scannerVersion)}
      data-testid="scan-type-badge"
    >
      {/* `createElement` rather than binding the looked-up icon to a local
          `<Icon />`, which reads to react-hooks/static-components as a
          component defined during render. */}
      {createElement(scanTypeIcon(scanType), { className: "size-3" })}
      {scanTypeLabel(scanType)}
    </Badge>
  );
}
