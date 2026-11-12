"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownToLine, HardDrive } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useInstanceQuota } from "@/hooks/use-instance-quota";
import {
  barPercent,
  formatPercent,
  formatQuotaDate,
  formatUsage,
  type InstanceQuota,
  type StorageQuota,
  type TransferQuota,
} from "@/lib/quota";
import { formatBytes, cn } from "@/lib/utils";

type Level = "ok" | "warning" | "critical";

const BAR_CLASSES: Record<Level, string> = {
  ok: "bg-primary",
  warning: "bg-amber-500",
  critical: "bg-red-600 dark:bg-red-500",
};

const STATUS_CLASSES: Record<Level, string> = {
  ok: "text-muted-foreground",
  warning: "text-amber-700 dark:text-amber-300",
  critical: "text-red-700 dark:text-red-300",
};

function QuotaCard({
  testId,
  icon: Icon,
  label,
  usedBytes,
  quotaBytes,
  percent,
  level,
  status,
  detail,
}: Readonly<{
  testId: string;
  icon: LucideIcon;
  label: string;
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  level: Level;
  /** Text naming the state, so colour is never the only signal. */
  status: string;
  detail?: string | null;
}>) {
  const pct = formatPercent(percent);
  return (
    <Card data-testid={testId}>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/50">
            <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tracking-tight tabular-nums">
              {formatUsage(usedBytes, quotaBytes)}
            </p>
          </div>
          <p className="text-lg font-semibold tabular-nums">{pct}</p>
        </div>
        <div
          role="progressbar"
          aria-label={`${label}: ${pct} of the quota used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(barPercent(percent))}
          aria-valuetext={`${formatUsage(usedBytes, quotaBytes)} (${pct})`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-all", BAR_CLASSES[level])}
            style={{ width: `${barPercent(percent)}%` }}
          />
        </div>
        <p className={cn("text-xs", STATUS_CLASSES[level])}>
          <span className="font-medium">{status}</span>
          {detail ? <span className="text-muted-foreground"> · {detail}</span> : null}
        </p>
      </CardContent>
    </Card>
  );
}

function storageCard(q: StorageQuota) {
  const level: Level =
    q.state === "exceeded" ? "critical" : q.state === "warning" ? "warning" : "ok";
  const status =
    q.state === "exceeded"
      ? "Quota reached: new uploads are refused"
      : q.state === "warning"
        ? "Nearly full"
        : "Within quota";
  return (
    <QuotaCard
      testId="quota-card-storage"
      icon={HardDrive}
      label="Storage quota"
      usedBytes={q.usedBytes}
      quotaBytes={q.quotaBytes}
      percent={q.percent}
      level={level}
      status={status}
      detail={`warning at ${q.warnPercent}%`}
    />
  );
}

function transferCard(q: TransferQuota) {
  const level: Level =
    q.state === "over" || q.state === "refusing"
      ? "critical"
      : q.state === "warning"
        ? "warning"
        : "ok";
  const status = {
    ok: "Within quota",
    warning: "Nearly used",
    over: `Over quota: downloads refused after ${formatBytes(q.hardLimitBytes)}`,
    refusing: "Quota used up: downloads are refused",
  }[q.state];
  const resets = formatQuotaDate(q.periodEnd);
  return (
    <QuotaCard
      testId="quota-card-transfer"
      icon={ArrowDownToLine}
      label="Transfer this month"
      usedBytes={q.usedBytes}
      quotaBytes={q.quotaBytes}
      percent={q.percent}
      level={level}
      status={status}
      detail={resets ? `resets ${resets}` : null}
    />
  );
}

/** Storage and monthly transfer quota cards; nothing when neither is configured. */
export function QuotaUsageCards({ quota }: Readonly<{ quota: InstanceQuota | null }>) {
  if (!quota || (!quota.storage && !quota.transfer)) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="quota-usage">
      {quota.storage && storageCard(quota.storage)}
      {quota.transfer && transferCard(quota.transfer)}
    </div>
  );
}

/** Dashboard section showing the instance quotas to every signed-in user. */
export function QuotaUsageSection() {
  const quota = useInstanceQuota();
  if (!quota || (!quota.storage && !quota.transfer)) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Quotas
      </h2>
      <QuotaUsageCards quota={quota} />
    </section>
  );
}
