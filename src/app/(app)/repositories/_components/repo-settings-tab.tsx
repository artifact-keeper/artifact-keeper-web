"use client";

import { useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, Trash2, Play, Eye } from "lucide-react";
import { toast } from "sonner";

import { repositoriesApi } from "@/lib/api/repositories";
import { supportsVersioning } from "@/lib/api/versions";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import lifecycleApi from "@/lib/api/lifecycle";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import type { Repository } from "@/types";
import type { LifecyclePolicy, PolicyType } from "@/types/lifecycle";
import { POLICY_TYPE_LABELS } from "@/types/lifecycle";
import { quotaToBytes, bytesToQuota } from "./repo-dialogs";
import { ReleaseTargetSettings } from "./release-target-settings";
import { RoutingRulesSettings } from "./routing-rules-settings";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type QuotaUnit = "MB" | "GB";

type AgeUnit = "hours" | "days";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

/** Convert an age value and unit to whole minutes. Clamps negatives to 0. */
export function ageToMinutes(value: string, unit: AgeUnit): number {
  const num = Number(value);
  if (!num || num <= 0 || !Number.isFinite(num)) return 0;
  const factor = unit === "days" ? MINUTES_PER_DAY : MINUTES_PER_HOUR;
  return Math.round(num * factor);
}

// Backend constraints from `validate_cache_ttl` in repositories.rs: 1s..=30d.
// The constants live here (not on the SDK) so the UI can show a clear inline
// validation error before submitting; the backend would otherwise reject with
// a 400 + opaque message.
const CACHE_TTL_MIN_SECONDS = 1;
const CACHE_TTL_MAX_SECONDS = 30 * 24 * 60 * 60; // 2,592,000

/**
 * Format a TTL in seconds as a short human-readable hint
 * ("24 hours", "1 day 6 hours", "30 minutes"). Used as a helper line under
 * the TTL input so operators don't have to compute "is 86400 a sensible
 * number?" in their head.
 */
function formatTtlHint(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const day = 24 * 60 * 60;
  const hour = 60 * 60;
  const minute = 60;
  const days = Math.floor(seconds / day);
  const hours = Math.floor((seconds % day) / hour);
  const minutes = Math.floor((seconds % hour) / minute);
  const secs = seconds % minute;

  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (secs && parts.length === 0) parts.push(`${secs} second${secs === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export interface UpdateRepositoryFields {
  key?: string;
  name?: string;
  description?: string;
  is_public?: boolean;
  quota_bytes?: number | null;
  /** First-class artifact versioning opt-in (#571, Generic/Mlmodel only). */
  versioning_enabled?: boolean;
}

/** Convert UpdateRepositoryFields to the shape repositoriesApi.update expects. */
function toUpdatePayload(
  fields: UpdateRepositoryFields
): Partial<{
  key: string;
  name: string;
  description: string;
  is_public: boolean;
  quota_bytes: number;
  versioning_enabled: boolean;
}> {
  const { quota_bytes, ...rest } = fields;
  // The SDK type does not accept null for quota_bytes, so strip it.
  if (quota_bytes != null) {
    return { ...rest, quota_bytes };
  }
  return rest;
}

interface RepoSettingsTabProps {
  repository: Repository;
}

export function RepoSettingsTab({ repository }: RepoSettingsTabProps) {
  const queryClient = useQueryClient();

  // -- General settings form state (override-based, like the edit dialog) --
  const defaults = useMemo(
    () => ({
      key: repository.key,
      name: repository.name,
      description: repository.description ?? "",
      is_public: repository.is_public,
      versioning_enabled: repository.versioning_enabled ?? false,
    }),
    [repository]
  );

  const [overrides, setOverrides] = useState<Partial<typeof defaults>>({});
  const form = useMemo(
    () => ({ ...defaults, ...overrides }),
    [defaults, overrides]
  );
  const keyChanged = form.key !== repository.key;

  // Quota state
  const quotaDefaults = useMemo(
    () => bytesToQuota(repository.quota_bytes),
    [repository.quota_bytes]
  );
  const [quotaOverrides, setQuotaOverrides] = useState<{
    value?: string;
    unit?: QuotaUnit;
  }>({});
  const quotaValue = quotaOverrides.value ?? quotaDefaults.value;
  const quotaUnit = quotaOverrides.unit ?? quotaDefaults.unit;

  // -- Proxy cache TTL state (#448) --
  // Only meaningful for Remote (proxy) repos; the section is hidden for
  // Local / Virtual / Staging because writes against those types are
  // rejected upstream with 400 (see is_cache_ttl_configurable). We still
  // run the GET unconditionally if the section is visible so the read uses
  // the same code path the backend tests pin (#917).
  const isRemote = repository.repo_type === "remote";
  const { data: cacheTtlData, isLoading: cacheTtlLoading } = useQuery({
    queryKey: ["cache-ttl", repository.key],
    queryFn: () => repositoriesApi.getCacheTtl(repository.key),
    enabled: isRemote,
  });
  const currentCacheTtlSeconds = cacheTtlData?.cache_ttl_seconds;
  // String-typed override so the input stays controlled while the user is
  // typing (e.g. mid-edit "8" before they finish "86400") without snapping
  // to the parsed number on every keystroke.
  const [cacheTtlOverride, setCacheTtlOverride] = useState<string | undefined>(undefined);
  const cacheTtlInputValue =
    cacheTtlOverride ??
    (currentCacheTtlSeconds != null ? String(currentCacheTtlSeconds) : "");
  const parsedCacheTtl =
    cacheTtlInputValue.trim() === "" ? null : Number(cacheTtlInputValue);
  const cacheTtlIsValid =
    parsedCacheTtl != null &&
    Number.isInteger(parsedCacheTtl) &&
    parsedCacheTtl >= CACHE_TTL_MIN_SECONDS &&
    parsedCacheTtl <= CACHE_TTL_MAX_SECONDS;
  const cacheTtlChanged =
    isRemote &&
    cacheTtlOverride !== undefined &&
    parsedCacheTtl !== currentCacheTtlSeconds;

  // First-class versioning is only offered where the backend applies it:
  // Generic/Mlmodel repositories (backend `versioning_applies`, #571).
  const versioningSupported = supportsVersioning(repository.format);

  // Detect whether the form has unsaved changes
  const hasChanges = useMemo(() => {
    if (form.key !== repository.key) return true;
    if (form.name !== repository.name) return true;
    if (form.description !== (repository.description ?? "")) return true;
    if (form.is_public !== repository.is_public) return true;
    if (form.versioning_enabled !== (repository.versioning_enabled ?? false))
      return true;
    const currentQuotaBytes = quotaToBytes(quotaValue, quotaUnit);
    const originalQuotaBytes = repository.quota_bytes ?? null;
    if (currentQuotaBytes !== originalQuotaBytes) return true;
    if (cacheTtlChanged) return true;
    return false;
  }, [form, quotaValue, quotaUnit, repository, cacheTtlChanged]);

  // -- Save mutation --
  const saveMutation = useMutation({
    mutationFn: (fields: UpdateRepositoryFields) =>
      repositoriesApi.update(repository.key, toUpdatePayload(fields)),
    onSuccess: (updatedRepo) => {
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      // If the key changed, also invalidate the new key
      if (updatedRepo.key !== repository.key) {
        queryClient.invalidateQueries({ queryKey: ["repository", updatedRepo.key] });
      }
      setOverrides({});
      setQuotaOverrides({});
      toast.success("Repository settings saved");
    },
    onError: mutationErrorToast("Failed to save repository settings"),
  });

  // -- Cache TTL mutation (#448, separate endpoint from `update`) --
  const setCacheTtlMutation = useMutation({
    mutationFn: (seconds: number) =>
      repositoriesApi.setCacheTtl(repository.key, seconds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cache-ttl", repository.key] });
      setCacheTtlOverride(undefined);
      toast.success("Cache TTL saved");
    },
    onError: mutationErrorToast("Failed to save cache TTL"),
  });

  const handleSave = useCallback(async () => {
    // The general-fields update and the cache-TTL update are two separate
    // backend endpoints, so dispatch them independently. We deliberately do
    // NOT short-circuit one on the other's failure: a bad TTL value
    // shouldn't roll back a good name change, and the per-mutation toast
    // already tells the operator which side failed. The promises are run
    // in parallel because both are idempotent and the round-trips are
    // independent.
    const fields: UpdateRepositoryFields = {};
    if (form.name !== repository.name) fields.name = form.name;
    if (form.description !== (repository.description ?? ""))
      fields.description = form.description;
    if (form.is_public !== repository.is_public)
      fields.is_public = form.is_public;
    if (form.versioning_enabled !== (repository.versioning_enabled ?? false))
      fields.versioning_enabled = form.versioning_enabled;
    if (keyChanged) fields.key = form.key;

    const newQuota = quotaToBytes(quotaValue, quotaUnit);
    const originalQuota = repository.quota_bytes ?? null;
    if (newQuota !== originalQuota) {
      fields.quota_bytes = newQuota;
    }

    const promises: Promise<unknown>[] = [];
    if (Object.keys(fields).length > 0) {
      promises.push(saveMutation.mutateAsync(fields));
    }
    if (cacheTtlChanged && cacheTtlIsValid && parsedCacheTtl != null) {
      promises.push(setCacheTtlMutation.mutateAsync(parsedCacheTtl));
    }
    // Awaited via Promise.allSettled so a 4xx on one side doesn't surface
    // as an unhandled rejection — each mutation already wired its own
    // onError toast.
    await Promise.allSettled(promises);
  }, [
    form,
    quotaValue,
    quotaUnit,
    repository,
    keyChanged,
    saveMutation,
    cacheTtlChanged,
    cacheTtlIsValid,
    parsedCacheTtl,
    setCacheTtlMutation,
  ]);

  const handleDiscard = useCallback(() => {
    setOverrides({});
    setQuotaOverrides({});
    setCacheTtlOverride(undefined);
  }, []);

  // -- Lifecycle policies --
  const { data: policies, isLoading: policiesLoading } = useQuery({
    queryKey: ["lifecycle-policies", repository.id],
    queryFn: () => lifecycleApi.list({ repository_id: repository.id }),
    enabled: !!repository.id,
  });

  const deletePolicyMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["lifecycle-policies", repository.id],
      });
      toast.success("Cleanup policy deleted");
    },
    onError: mutationErrorToast("Failed to delete cleanup policy"),
  });

  const executePolicyMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.execute(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["lifecycle-policies", repository.id],
      });
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      toast.success(
        `Policy executed: ${result.artifacts_removed} artifact(s) removed, ${formatBytes(result.bytes_freed)} freed`
      );
    },
    onError: mutationErrorToast("Failed to execute cleanup policy"),
  });

  const previewPolicyMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.preview(id),
    onSuccess: (result) => {
      toast.info(
        `Preview: ${result.artifacts_matched} artifact(s) would be removed (${formatBytes(result.bytes_freed)})`
      );
    },
    onError: mutationErrorToast("Failed to preview cleanup policy"),
  });

  // -- Package age policy (#265). Quarantine-on-release for remote repos. --
  // These seed from local defaults rather than persisted config, so Save stays
  // disabled until the operator makes an explicit change. That prevents a
  // pristine form from writing the defaults over an existing policy on save.
  // (review fix #464)
  const [ageEnabled, setAgeEnabledState] = useState(false);
  const [ageValue, setAgeValueState] = useState("3");
  const [ageUnit, setAgeUnitState] = useState<AgeUnit>("days");
  const [ageDirty, setAgeDirty] = useState(false);

  const setAgeEnabled = (v: boolean) => {
    setAgeEnabledState(v);
    setAgeDirty(true);
  };
  const setAgeValue = (v: string) => {
    setAgeValueState(v);
    setAgeDirty(true);
  };
  const setAgeUnit = (v: AgeUnit) => {
    setAgeUnitState(v);
    setAgeDirty(true);
  };

  const ageMinutes = ageToMinutes(ageValue, ageUnit);
  const ageInvalid = ageEnabled && ageMinutes <= 0;

  const ageMutation = useMutation({
    mutationFn: () =>
      repositoriesApi.updateAgePolicy(repository.key, {
        enabled: ageEnabled,
        duration_minutes: ageMinutes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      setAgeDirty(false);
      toast.success(
        ageEnabled
          ? "Package age policy enabled"
          : "Package age policy disabled"
      );
    },
    onError: mutationErrorToast("Failed to save package age policy"),
  });

  // -- Effective upload size limit (#189). Read-only here; configured by an
  // admin on the global Settings page. Surfaced so repo owners can see the
  // ceiling that applies to uploads into this repository. --
  const { data: adminSettings } = useAdminSettings();
  const maxUploadBytes = adminSettings?.storageSettings.max_upload_size_bytes;

  return (
    <div className="max-w-2xl space-y-8">
      {/* -- General Settings Section -- */}
      <section aria-labelledby="settings-general-heading">
        <h3 id="settings-general-heading" className="text-base font-semibold mb-4">
          General
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-key">Repository Key</Label>
            <Input
              id="settings-key"
              value={form.key}
              onChange={(e) =>
                setOverrides((o) => ({
                  ...o,
                  key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                }))
              }
              required
            />
            {keyChanged && (
              <p className="text-sm text-yellow-600 dark:text-yellow-500">
                Changing the key will update all URLs for this repository. Existing
                client configurations will need to be updated.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              value={form.name}
              onChange={(e) =>
                setOverrides((o) => ({ ...o, name: e.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-description">Description</Label>
            <Textarea
              id="settings-description"
              value={form.description}
              onChange={(e) =>
                setOverrides((o) => ({ ...o, description: e.target.value }))
              }
              placeholder="Describe the purpose of this repository..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="settings-visibility">Public Access</Label>
              <p className="text-xs text-muted-foreground">
                Public repositories allow unauthenticated read access.
              </p>
            </div>
            <Switch
              id="settings-visibility"
              checked={form.is_public}
              onCheckedChange={(v) =>
                setOverrides((o) => ({ ...o, is_public: v }))
              }
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* -- Storage Section -- */}
      <section aria-labelledby="settings-storage-heading">
        <h3 id="settings-storage-heading" className="text-base font-semibold mb-4">
          Storage
        </h3>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Currently using{" "}
            <span className="font-medium text-foreground">
              {formatBytes(repository.storage_used_bytes)}
            </span>
            {repository.quota_bytes ? (
              <>
                {" "}of{" "}
                <span className="font-medium text-foreground">
                  {formatBytes(repository.quota_bytes)}
                </span>
                {" "}quota
                {" "}
                <span className="text-xs">
                  ({Math.round(
                    (repository.storage_used_bytes / repository.quota_bytes) * 100
                  )}% used)
                </span>
              </>
            ) : (
              <> (no quota set)</>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-quota">Storage Quota</Label>
            <div className="flex gap-2">
              <Input
                id="settings-quota"
                type="number"
                min="0"
                step="any"
                placeholder="No limit"
                value={quotaValue}
                onChange={(e) =>
                  setQuotaOverrides((o) => ({ ...o, value: e.target.value }))
                }
                className="flex-1"
              />
              <Select
                value={quotaUnit}
                onValueChange={(v) =>
                  setQuotaOverrides((o) => ({ ...o, unit: v as QuotaUnit }))
                }
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MB">MB</SelectItem>
                  <SelectItem value="GB">GB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum storage for this repository. Leave empty for no limit.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Upload Size Limit</Label>
            <Input
              value={
                maxUploadBytes == null
                  ? "Loading..."
                  : maxUploadBytes === 0
                    ? "No limit"
                    : formatBytes(maxUploadBytes)
              }
              disabled
              className="bg-muted/50"
              aria-label="Upload size limit"
            />
            <p className="text-xs text-muted-foreground">
              Maximum size for a single artifact upload. This limit is set
              instance-wide by an administrator on the Settings page and applies
              to every repository.
            </p>
          </div>
        </div>
      </section>

      <Separator />

      {/* -- Artifact Versioning Section (#571, Generic/Mlmodel only) -- */}
      {versioningSupported && (
        <>
          <section aria-labelledby="settings-versioning-heading">
            <div className="mb-4">
              <h3
                id="settings-versioning-heading"
                className="text-base font-semibold"
              >
                Artifact Versioning
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Keep an immutable revision history for artifacts in this
                repository. Re-uploading a path with different content appends
                a new revision instead of overwriting; prior revisions stay
                downloadable from the artifact&apos;s Versions tab.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="settings-versioning-enabled">
                  Enable versioning
                </Label>
                <p className="text-xs text-muted-foreground">
                  Applies to future uploads. Turning this off stops recording
                  new revisions; existing history remains addressable.
                </p>
              </div>
              <Switch
                id="settings-versioning-enabled"
                checked={form.versioning_enabled}
                onCheckedChange={(v) =>
                  setOverrides((o) => ({ ...o, versioning_enabled: v }))
                }
              />
            </div>
          </section>

          <Separator />
        </>
      )}

      {/* -- Package Age Policy Section (#265) -- */}
      <section aria-labelledby="settings-age-heading">
        <div className="mb-4">
          <h3 id="settings-age-heading" className="text-base font-semibold">
            Package Age Policy
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hold freshly published packages in quarantine for a cooldown period
            after their release. New releases pulled from upstream are not served
            until the window passes, giving time to flag a compromised release
            before it reaches clients.
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="settings-age-enabled">Enable age policy</Label>
              <p className="text-xs text-muted-foreground">
                Quarantine packages released within the cooldown window.
              </p>
            </div>
            <Switch
              id="settings-age-enabled"
              checked={ageEnabled}
              onCheckedChange={setAgeEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-age-duration">Cooldown period</Label>
            <div className="flex gap-2">
              <Input
                id="settings-age-duration"
                type="number"
                min="1"
                step="1"
                value={ageValue}
                onChange={(e) => setAgeValue(e.target.value)}
                disabled={!ageEnabled}
                className="flex-1"
                aria-invalid={ageInvalid}
                aria-describedby="settings-age-error"
              />
              <Select
                value={ageUnit}
                onValueChange={(v) => setAgeUnit(v as AgeUnit)}
                disabled={!ageEnabled}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Persistent live region so the validation error is announced and
                stays associated with the input via aria-describedby. */}
            <p id="settings-age-error" role="alert" className="text-sm text-destructive empty:hidden">
              {ageInvalid
                ? `Enter a cooldown period of at least one ${ageUnit === "days" ? "day" : "hour"}.`
                : ""}
            </p>
            {!ageInvalid && (
              <p id="settings-age-hint" className="text-xs text-muted-foreground">
                Packages released less than this long ago are quarantined.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => ageMutation.mutate()}
              disabled={ageMutation.isPending || ageInvalid || !ageDirty}
            >
              {ageMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Age Policy"
              )}
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* -- Release Target Section (staging promotion, #260) -- */}
      {repository.repo_type === "staging" && (
        <>
          <ReleaseTargetSettings repository={repository} />
          <Separator />
        </>
      )}

      {/* -- Routing Rules Section (path rewriting for proxy repos, #263) -- */}
      {(repository.repo_type === "remote" ||
        repository.repo_type === "virtual" ||
        repository.repo_type === "staging") && (
        <>
          <RoutingRulesSettings repository={repository} />
          <Separator />
        </>
      )}

      {/* -- Proxy Cache Section (#448, Remote-only) -- */}
      {isRemote && (
        <>
          <section aria-labelledby="settings-cache-heading">
            <h3 id="settings-cache-heading" className="text-base font-semibold mb-4">
              Proxy Cache
            </h3>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                How long the proxy keeps cached upstream artifacts before
                re-validating against upstream. Applies repository-wide; per-
                artifact eviction is available from the artifact details
                dialog.
              </p>

              <div className="space-y-2">
                <Label htmlFor="settings-cache-ttl">Cache TTL (seconds)</Label>
                {cacheTtlLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <>
                    <Input
                      id="settings-cache-ttl"
                      type="number"
                      min={CACHE_TTL_MIN_SECONDS}
                      max={CACHE_TTL_MAX_SECONDS}
                      step={1}
                      value={cacheTtlInputValue}
                      onChange={(e) => setCacheTtlOverride(e.target.value)}
                      aria-invalid={
                        cacheTtlOverride !== undefined && !cacheTtlIsValid
                      }
                      aria-describedby="settings-cache-ttl-error"
                    />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Range: {CACHE_TTL_MIN_SECONDS}s to{" "}
                        {CACHE_TTL_MAX_SECONDS.toLocaleString()}s (30 days)
                      </span>
                      {parsedCacheTtl != null && cacheTtlIsValid && (
                        <span className="text-muted-foreground">
                          ≈ {formatTtlHint(parsedCacheTtl)}
                        </span>
                      )}
                    </div>
                    {/* Persistent live region so the validation error is
                        announced and stays associated with the input via
                        aria-describedby, mirroring the age-policy field. */}
                    <p
                      id="settings-cache-ttl-error"
                      role="alert"
                      className="text-sm text-destructive empty:hidden"
                    >
                      {cacheTtlOverride !== undefined && !cacheTtlIsValid
                        ? `Must be a whole number between ${CACHE_TTL_MIN_SECONDS} and ${CACHE_TTL_MAX_SECONDS.toLocaleString()}.`
                        : ""}
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>

          <Separator />
        </>
      )}

      {/* -- Cleanup Policies Section -- */}
      <section aria-labelledby="settings-cleanup-heading">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 id="settings-cleanup-heading" className="text-base font-semibold">
              Cleanup Policies
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lifecycle policies that automatically remove old or unused artifacts.
            </p>
          </div>
        </div>

        {policiesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !policies || policies.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No cleanup policies configured for this repository.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cleanup policies can be created from the Lifecycle section in
              the administration panel.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {policies.map((policy) => (
              <CleanupPolicyRow
                key={policy.id}
                policy={policy}
                onPreview={() => previewPolicyMutation.mutate(policy.id)}
                onExecute={() => executePolicyMutation.mutate(policy.id)}
                onDelete={() => deletePolicyMutation.mutate(policy.id)}
                previewPending={previewPolicyMutation.isPending}
                executePending={executePolicyMutation.isPending}
                deletePending={deletePolicyMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* -- Read-only Info Section -- */}
      <section aria-labelledby="settings-info-heading">
        <h3 id="settings-info-heading" className="text-base font-semibold mb-4">
          Repository Info
        </h3>
        <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Format</dt>
          <dd>
            <Badge variant="secondary" className="text-xs">
              {repository.format.toUpperCase()}
            </Badge>
          </dd>
          <dt className="text-muted-foreground">Type</dt>
          <dd className="capitalize">{repository.repo_type}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{new Date(repository.created_at).toLocaleDateString()}</dd>
          <dt className="text-muted-foreground">Last Updated</dt>
          <dd>{new Date(repository.updated_at).toLocaleDateString()}</dd>
          {repository.upstream_url && (
            <>
              <dt className="text-muted-foreground">Upstream URL</dt>
              <dd className="font-mono text-xs break-all">
                {repository.upstream_url}
              </dd>
            </>
          )}
        </dl>
      </section>

      {/* -- Save / Discard bar -- */}
      {hasChanges && (
        <div className="sticky bottom-0 bg-background border-t pt-4 pb-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 text-yellow-500" />
            <span>You have unsaved changes</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleDiscard}
              disabled={
                saveMutation.isPending || setCacheTtlMutation.isPending
              }
            >
              Discard
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saveMutation.isPending ||
                setCacheTtlMutation.isPending ||
                !form.name.trim() ||
                !form.key.trim() ||
                (cacheTtlChanged && !cacheTtlIsValid)
              }
            >
              {saveMutation.isPending || setCacheTtlMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Cleanup policy row sub-component --

interface CleanupPolicyRowProps {
  policy: LifecyclePolicy;
  onPreview: () => void;
  onExecute: () => void;
  onDelete: () => void;
  previewPending: boolean;
  executePending: boolean;
  deletePending: boolean;
}

function CleanupPolicyRow({
  policy,
  onPreview,
  onExecute,
  onDelete,
  previewPending,
  executePending,
  deletePending,
}: CleanupPolicyRowProps) {
  const typeLabel =
    POLICY_TYPE_LABELS[policy.policy_type as PolicyType] ?? policy.policy_type;

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{policy.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-xs font-normal">
              {typeLabel}
            </Badge>
            <Badge
              variant={policy.enabled ? "default" : "secondary"}
              className="text-xs font-normal"
            >
              {policy.enabled ? "Active" : "Disabled"}
            </Badge>
            {policy.last_run_at && (
              <span className="text-xs text-muted-foreground">
                Last run: {new Date(policy.last_run_at).toLocaleDateString()}
                {policy.last_run_items_removed != null &&
                  ` (${policy.last_run_items_removed} removed)`}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onPreview}
              disabled={previewPending}
              aria-label={`Preview policy ${policy.name}`}
            >
              <Eye className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Preview (dry run)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onExecute}
              disabled={executePending}
              aria-label={`Execute policy ${policy.name}`}
            >
              <Play className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Execute now</TooltipContent>
        </Tooltip>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  disabled={deletePending}
                  aria-label={`Delete policy ${policy.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete policy</TooltipContent>
            </Tooltip>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Cleanup Policy</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the &quot;{policy.name}&quot; policy?
                This will not affect any previously cleaned artifacts.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
