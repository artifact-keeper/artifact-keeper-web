"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wrench } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useRepositories } from "@/hooks/use-repositories";
import { useAuth } from "@/providers/auth-provider";
import { maintenanceApi } from "@/lib/api/maintenance";
import type {
  LedgerBackfillResult,
  PackagesBackfillResult,
} from "@/lib/api/maintenance";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { QUERY_KEYS } from "@/lib/query-keys";
import { formatBytes } from "@/lib/utils";

/**
 * Admin maintenance card (#859) for the two idempotent repair actions backend
 * 1.10.0 added: the storage-ledger backfill (artifact-keeper#3650) and the
 * package-catalog backfill (artifact-keeper#3659, #3660). Both are one-shot
 * post-upgrade / post-restore actions, so they are deliberately manual buttons
 * behind a confirmation rather than anything automatic.
 *
 * Admin-only: the endpoints are admin-guarded server-side and the card renders
 * nothing for a non-admin, matching the gating on the surrounding settings
 * surfaces.
 */

/** Sentinel for "no repository scope" — Radix Select rejects an empty value. */
const ALL_REPOSITORIES = "__all__";

/**
 * Format a signed byte delta. `formatBytes` returns the "--" sentinel for
 * negative input (#348), so the sign is carried separately and the magnitude
 * formatted as usual.
 */
export function formatDriftBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return formatBytes(bytes);
  if (bytes === 0) return "0 B";
  return `${bytes < 0 ? "-" : "+"}${formatBytes(Math.abs(bytes))}`;
}

/** A labelled figure in the result summary grid. */
function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

/** Ledger totals plus the per-repository rows the backfill actually changed. */
function LedgerResultPanel({ result }: { result: LedgerBackfillResult }) {
  const drifted = result.repositories.filter((r) => r.drift_bytes !== 0);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ResultStat
          label="Repositories checked"
          value={String(result.repositories_checked)}
        />
        <ResultStat
          label="Repositories repaired"
          value={String(result.repositories_repaired)}
        />
        <ResultStat
          label="Repositories skipped"
          value={String(result.repositories_skipped)}
        />
        <ResultStat
          label="Total drift"
          value={formatBytes(result.total_drift_bytes)}
        />
        <ResultStat
          label="Headline before"
          value={formatBytes(result.before_total_storage_bytes)}
        />
        <ResultStat
          label="Headline after"
          value={formatBytes(result.after_total_storage_bytes)}
        />
      </div>

      {drifted.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No drift detected — every ledger row already matched the artifact
          tables, so the storage headline was already correct.
        </p>
      ) : (
        <div className="max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead className="text-right">Hosted</TableHead>
                <TableHead className="text-right">Proxy</TableHead>
                <TableHead className="text-right">OCI</TableHead>
                <TableHead className="text-right">Drift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drifted.map((repo) => (
                <TableRow key={repo.repository_id}>
                  <TableCell className="font-medium">
                    {repo.repository_key}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {repo.before_total_bytes === null
                      ? "No ledger row"
                      : formatBytes(repo.before_total_bytes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(repo.after_total_bytes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(repo.after_hosted_bytes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(repo.after_proxy_bytes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(repo.after_oci_bytes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDriftBytes(repo.drift_bytes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Counts from a package-catalog backfill run. */
function PackagesResultPanel({ result }: { result: PackagesBackfillResult }) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm">{result.message}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResultStat
          label="Artifacts scanned"
          value={String(result.artifacts_scanned)}
        />
        <ResultStat
          label="Packages registered"
          value={String(result.packages_registered)}
        />
        <ResultStat
          label="Artifacts skipped"
          value={String(result.artifacts_skipped)}
        />
        <ResultStat
          label="Artifacts failed"
          value={String(result.artifacts_failed)}
        />
      </div>
    </div>
  );
}

export function MaintenanceCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [ledgerConfirmOpen, setLedgerConfirmOpen] = useState(false);
  const [packagesConfirmOpen, setPackagesConfirmOpen] = useState(false);
  const [repositoryKey, setRepositoryKey] = useState(ALL_REPOSITORIES);

  const isAdmin = Boolean(user?.is_admin);
  const { data: repositories } = useRepositories(
    { per_page: 1000 },
    { enabled: isAdmin },
  );

  const ledgerMutation = useMutation({
    mutationFn: () => maintenanceApi.backfillStorageLedger(),
    onSuccess: (result) => {
      setLedgerConfirmOpen(false);
      toast.success(
        result.repositories_repaired > 0
          ? `Repaired ${result.repositories_repaired} ledger row(s)`
          : "Storage ledger already consistent",
      );
      // The headline this repairs is /admin/stats.total_storage_bytes, which
      // the dashboard reads from the admin-stats query.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN_STATS });
    },
    onError: mutationErrorToast("Failed to recompute the storage ledger"),
  });

  const packagesMutation = useMutation({
    mutationFn: (key: string | undefined) => maintenanceApi.backfillPackages(key),
    onSuccess: (result) => {
      setPackagesConfirmOpen(false);
      toast.success(
        `Registered ${result.packages_registered} package(s) from ${result.artifacts_scanned} artifact(s)`,
      );
      queryClient.invalidateQueries({ queryKey: ["packages"] });
    },
    onError: mutationErrorToast("Failed to backfill the package catalog"),
  });

  if (!isAdmin) return null;

  const scopedKey =
    repositoryKey === ALL_REPOSITORIES ? undefined : repositoryKey;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Maintenance</CardTitle>
        </div>
        <CardDescription>
          One-shot repair actions for an instance that was upgraded or restored
          from a backup. Both are idempotent and safe to run more than once.
          Requires backend 1.10.0+.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Recompute storage ledger</p>
            <p className="text-xs text-muted-foreground">
              Recomputes each repository&apos;s usage ledger from the artifact,
              proxy-cache, and OCI blob tables. A database restored from backup
              never fires the triggers that maintain the ledger, so the storage
              headline can understate the real figure by orders of magnitude.
              Nothing is deleted — only the accounting is rewritten.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setLedgerConfirmOpen(true)}
            disabled={ledgerMutation.isPending}
          >
            {ledgerMutation.isPending && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            {ledgerMutation.isPending ? "Recomputing..." : "Recompute Ledger"}
          </Button>
          {ledgerMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {toUserMessage(
                  ledgerMutation.error,
                  "Failed to recompute the storage ledger",
                )}
              </AlertDescription>
            </Alert>
          )}
          {ledgerMutation.data && (
            <LedgerResultPanel result={ledgerMutation.data} />
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Backfill package catalog</p>
            <p className="text-xs text-muted-foreground">
              Replays existing artifacts through the package-catalog upsert so
              packages published before catalog registration landed become
              visible on the Packages page. Optionally scope the walk to one
              repository.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="packages-backfill-repository" className="text-sm">
              Repository
            </Label>
            <Select value={repositoryKey} onValueChange={setRepositoryKey}>
              <SelectTrigger
                id="packages-backfill-repository"
                className="w-full sm:w-80"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REPOSITORIES}>
                  All repositories
                </SelectItem>
                {(repositories?.items ?? []).map((repo) => (
                  <SelectItem key={repo.id} value={repo.key}>
                    {repo.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => setPackagesConfirmOpen(true)}
            disabled={packagesMutation.isPending}
          >
            {packagesMutation.isPending && (
              <Loader2 className="size-4 mr-2 animate-spin" />
            )}
            {packagesMutation.isPending
              ? "Backfilling..."
              : "Backfill Packages"}
          </Button>
          {packagesMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {toUserMessage(
                  packagesMutation.error,
                  "Failed to backfill the package catalog",
                )}
              </AlertDescription>
            </Alert>
          )}
          {packagesMutation.data && (
            <PackagesResultPanel result={packagesMutation.data} />
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={ledgerConfirmOpen}
        onOpenChange={setLedgerConfirmOpen}
        title="Recompute storage ledger?"
        description="Every repository's usage ledger is recomputed from the authoritative tables. No artifact data is touched and the action is idempotent, but it walks the whole catalogue and may take a while on a large instance."
        confirmText="Recompute"
        loading={ledgerMutation.isPending}
        onConfirm={() => ledgerMutation.mutate()}
      />

      <ConfirmDialog
        open={packagesConfirmOpen}
        onOpenChange={setPackagesConfirmOpen}
        title="Backfill package catalog?"
        description={
          scopedKey
            ? `Existing artifacts in "${scopedKey}" are replayed through the package-catalog upsert. Nothing is deleted and the action is idempotent.`
            : "Existing artifacts in every catalog-eligible hosted repository are replayed through the package-catalog upsert. Nothing is deleted and the action is idempotent, but a full walk may take a while on a large instance."
        }
        confirmText="Backfill"
        loading={packagesMutation.isPending}
        onConfirm={() => packagesMutation.mutate(scopedKey)}
      />
    </Card>
  );
}
