"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";

import { proxyScansApi } from "@/lib/api/proxy-scans";
import {
  PROXY_SCAN_FORBIDDEN_COPY,
  PROXY_SCAN_NOT_ENFORCED_COPY,
  PROXY_SCAN_NO_CVE_DETAIL_COPY,
  PROXY_SCAN_SIGN_IN_COPY,
  describeProxyVerdict,
  describeUnresolvedPath,
  resolveProxyScanView,
  severityBuckets,
  showsInheritedVerdict,
  type ProxyVerdictCopy,
  type ProxyVerdictTone,
} from "@/lib/proxy-scan";
import type { ProxyScanEnforcement } from "@/types/proxy-scans";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Verdict panel for a single proxy-cached artifact.
 *
 * Replaces the green `ShieldCheck` all-clear that `security-tab-content.tsx`
 * used to render for proxy content. That shield was driven by artifact-keyed
 * CVE history, which is structurally empty for proxy-cached artifacts — so an
 * artifact the download gate returned 403 for displayed "No vulnerabilities
 * detected".
 *
 * Every non-verdict state here is deliberately neutral or negative. There is
 * no code path in which a failed fetch, an unresolvable path, or a missing
 * verdict reads as clean.
 */

const TONE_STYLES: Record<
  ProxyVerdictTone,
  { container: string; heading: string; body: string }
> = {
  clean: {
    container:
      "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
    heading: "text-emerald-800 dark:text-emerald-400",
    body: "text-emerald-700 dark:text-emerald-500",
  },
  danger: {
    container: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
    heading: "text-red-800 dark:text-red-400",
    body: "text-red-700 dark:text-red-500",
  },
  neutral: {
    container: "border-border bg-muted/40",
    heading: "text-foreground",
    body: "text-muted-foreground",
  },
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "text-red-600 bg-red-100 dark:bg-red-950/40",
  high: "text-orange-600 bg-orange-100 dark:bg-orange-950/40",
  medium: "text-yellow-600 bg-yellow-100 dark:bg-yellow-950/40",
  low: "text-blue-600 bg-blue-100 dark:bg-blue-950/40",
};

function ToneIcon({ tone, className }: { tone: ProxyVerdictTone; className?: string }) {
  if (tone === "clean") return <ShieldCheck className={className} />;
  if (tone === "danger") return <ShieldAlert className={className} />;
  return <ShieldQuestion className={className} />;
}

/** Verdict callout. Exported for the repository-level summary to reuse. */
export function ProxyVerdictCallout({
  copy,
  children,
}: {
  copy: ProxyVerdictCopy;
  children?: React.ReactNode;
}) {
  const styles = TONE_STYLES[copy.tone];
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 ${styles.container}`}
      data-testid="proxy-scan-verdict"
      data-tone={copy.tone}
    >
      <ToneIcon tone={copy.tone} className={`size-5 shrink-0 mt-0.5 ${styles.heading}`} />
      <div className="min-w-0 space-y-1">
        <p className={`text-sm font-medium ${styles.heading}`}>{copy.headline}</p>
        <p className={`text-xs ${styles.body}`}>{copy.detail}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * "Recorded elsewhere, not enforced here." Verdicts are global by content
 * digest, so a repository with scan-on-proxy off can display a verdict another
 * repository recorded for byte-identical content. Hiding it would re-create
 * the original bug; the honest fix is saying it is not enforced here.
 */
export function ProxyEnforcementBanner() {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950/30"
      data-testid="proxy-scan-enforcement-banner"
    >
      <AlertTriangle className="size-4 shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-500" />
      <p className="text-xs text-yellow-800 dark:text-yellow-400">
        {PROXY_SCAN_NOT_ENFORCED_COPY}
      </p>
    </div>
  );
}

/**
 * Sign-in / access-denied state. The repositories pages sit outside the
 * `(protected)` route group, so this renders for anonymous viewers on public
 * repositories — the audience the green all-clear misled.
 */
export function ProxyScanAccessNotice({
  failure,
}: {
  failure: "unauthenticated" | "forbidden" | "error";
}) {
  const copy =
    failure === "unauthenticated"
      ? PROXY_SCAN_SIGN_IN_COPY
      : failure === "forbidden"
        ? PROXY_SCAN_FORBIDDEN_COPY
        : "Scan status could not be loaded. This is not a clean result.";
  return (
    <div
      className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4"
      data-testid="proxy-scan-access-notice"
      data-failure={failure}
    >
      <LockKeyhole className="size-5 shrink-0 mt-0.5 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{copy}</p>
        <p className="text-xs text-muted-foreground">
          Scan verdicts for proxy-cached content are only shown to signed-in
          users with access to this repository.
        </p>
      </div>
    </div>
  );
}

export function ProxySeverityBadges({
  buckets,
  findingsCount,
}: {
  buckets: Array<{ key: string; count: number }>;
  findingsCount: number;
}) {
  if (findingsCount <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      <span className="text-xs font-medium tabular-nums">
        {findingsCount} finding{findingsCount === 1 ? "" : "s"}
      </span>
      {buckets.map((bucket) => (
        <Badge
          key={bucket.key}
          variant="outline"
          className={`text-xs uppercase ${SEVERITY_BADGE[bucket.key] ?? ""}`}
        >
          {bucket.count} {bucket.key}
        </Badge>
      ))}
    </div>
  );
}

export function ProxyScanPanel({
  repositoryKey,
  path,
}: {
  repositoryKey: string;
  /** Cache path within the repository. Lookup is by path, never by digest. */
  path: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["proxy-scan", repositoryKey, path],
    queryFn: () => proxyScansApi.getByPath(repositoryKey, path),
    // A 401 must surface immediately as the sign-in state rather than being
    // retried three times behind a spinner.
    retry: false,
  });

  const enforcement: ProxyScanEnforcement = {
    scan_on_proxy: data?.scan_on_proxy ?? false,
    proxy_scan_action: data?.proxy_scan_action ?? "fail_open",
  };

  const view = resolveProxyScanView({
    isLoading,
    error,
    entry: data?.entry,
  });

  return (
    <div className="space-y-3" data-testid="proxy-scan-panel">
      <div className="flex items-center gap-3">
        <ShieldQuestion className="size-5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Proxy Scan Status</h3>
      </div>

      {view.kind === "loading" && <Skeleton className="h-24 w-full" />}

      {view.kind === "failure" && <ProxyScanAccessNotice failure={view.failure} />}

      {view.kind === "unresolved" && (
        <ProxyVerdictCallout copy={describeUnresolvedPath()} />
      )}

      {view.kind === "verdict" && (
        <>
          <ProxyVerdictCallout
            copy={describeProxyVerdict(view.entry, enforcement)}
          >
            <ProxySeverityBadges
              buckets={severityBuckets(view.entry)}
              findingsCount={view.entry.findings_count}
            />
          </ProxyVerdictCallout>
          {showsInheritedVerdict(view.entry.state, enforcement) && (
            <ProxyEnforcementBanner />
          )}
        </>
      )}

      {/* The remedy. Without it the panel reports a problem and offers no way
          to act on it: proxy scans reduce findings to a verdict and counts and
          never persist them per-CVE. */}
      {view.kind !== "failure" && view.kind !== "loading" && (
        <p className="text-xs text-muted-foreground">
          {PROXY_SCAN_NO_CVE_DETAIL_COPY}
        </p>
      )}
    </div>
  );
}
