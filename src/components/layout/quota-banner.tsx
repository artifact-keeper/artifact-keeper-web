"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, OctagonAlert, X } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useInstanceQuota } from "@/hooks/use-instance-quota";
import { quotaNotices, type QuotaNotice, type QuotaNoticeKind } from "@/lib/quota";
import { cn } from "@/lib/utils";

/**
 * Per-session record of the worst state the user has dismissed for each
 * quota. A notice stays hidden until its state gets worse than that.
 */
export const QUOTA_BANNER_DISMISS_KEY = "ak.quota-banner.dismissed";

type Dismissed = Partial<Record<QuotaNoticeKind, number>>;

function readDismissed(): Dismissed {
  try {
    const raw = globalThis.sessionStorage?.getItem(QUOTA_BANNER_DISMISS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Dismissed = {};
    for (const kind of ["storage", "transfer"] as const) {
      const v = (parsed as Record<string, unknown>)[kind];
      if (typeof v === "number" && Number.isFinite(v)) out[kind] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDismissed(value: Dismissed): void {
  try {
    globalThis.sessionStorage?.setItem(QUOTA_BANNER_DISMISS_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, blocked): dismissal lasts until reload.
  }
}

const TONE_CLASSES: Record<QuotaNotice["tone"], string> = {
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  critical:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
};

/**
 * App-wide notice when the instance storage quota or the monthly transfer
 * quota is close to or past its limit. Renders nothing when no quota is
 * configured or the backend does not report quotas.
 */
export function QuotaBanner() {
  const { user } = useAuth();
  const quota = useInstanceQuota();
  const notices = quotaNotices(quota, !!user?.is_admin);
  const [dismissed, setDismissed] = useState<Dismissed>(readDismissed);

  // A dismissal covers the state it was made in and better ones. When a
  // quota recovers below the dismissed state, lower the record to match, so
  // climbing back up later shows the notice again.
  const severities: Record<QuotaNoticeKind, number> = { storage: 0, transfer: 0 };
  for (const n of notices) severities[n.kind] = n.severity;
  if (quota) {
    let next: Dismissed | null = null;
    for (const kind of ["storage", "transfer"] as const) {
      const d = dismissed[kind];
      if (d !== undefined && severities[kind] < d) {
        next = { ...(next ?? dismissed), [kind]: severities[kind] };
      }
    }
    if (next) setDismissed(next);
  }

  useEffect(() => {
    writeDismissed(dismissed);
  }, [dismissed]);

  const visible = notices.filter((n) => n.severity > (dismissed[n.kind] ?? 0));
  if (visible.length === 0) return null;

  const helpUrl = quota?.helpUrl ?? null;

  return (
    <div data-testid="quota-banner">
      {visible.map((n) => {
        const Icon = n.tone === "critical" ? OctagonAlert : AlertTriangle;
        return (
          <div
            key={n.kind}
            role={n.tone === "critical" ? "alert" : "status"}
            data-testid={`quota-banner-${n.kind}`}
            data-tone={n.tone}
            className={cn(
              "flex items-start gap-2 border-b px-4 py-2 text-sm",
              TONE_CLASSES[n.tone]
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1">
              {n.message}
              {helpUrl && (
                <>
                  {" "}
                  <a
                    href={helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline underline-offset-2"
                  >
                    Learn more<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setDismissed((d) => ({ ...d, [n.kind]: n.severity }))}
              className="-my-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current dark:hover:bg-white/10"
              aria-label={`Dismiss ${n.kind === "storage" ? "storage" : "transfer"} quota notice`}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
