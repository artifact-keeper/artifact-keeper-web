"use client";

import { useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, AlertTriangle, Trash2, Play, Eye } from "lucide-react";
import { toast } from "sonner";

import { repositoriesApi } from "@/lib/api/repositories";
import { ageGateApi } from "@/lib/api/age-gate";
import { supportsVersioning } from "@/lib/api/versions";
import { useAdminSettings } from "@/hooks/use-admin-settings";
import { useAuth } from "@/providers/auth-provider";
import { lifecycleApi } from "@/lib/api/lifecycle";
import {
  scanConfigApi,
  SEVERITY_THRESHOLDS,
  type RepoScanConfig,
  type ProxyScanAction,
  type UpsertScanConfigRequest,
} from "@/lib/api/scan-config";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import { useFormatHandlers } from "@/hooks/use-format-handlers";
import { isPluginBackedRepo, repoFormatLabel } from "@/lib/repo-format";
import type {
  Repository,
  DebianRepoConfig,
  CreateRepositoryRequest,
} from "@/types";
import type { LifecyclePolicy, PolicyType } from "@/types/lifecycle";
import { POLICY_TYPE_LABELS } from "@/types/lifecycle";
import { quotaToBytes, bytesToQuota } from "./repo-dialogs";
import {
  hasRpmTrustedKeyConfig,
  hasDebianConfig,
  hasNpmScopePolicy,
} from "../_lib/constants";
import { ReleaseTargetSettings } from "./release-target-settings";
import { RoutingRulesSettings } from "./routing-rules-settings";
import {
  RpmTrustedKeyField,
  DebianConfigFields,
  NpmScopePolicyFields,
  buildDebianConfigFields,
  buildNpmScopePolicyFields,
  formatList,
  EMPTY_RPM_CONFIG,
  type RpmConfigValue,
  type DebianConfigValue,
  type NpmScopePolicyValue,
} from "./format-config-fields";

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

/** Convert minutes back to a display value and unit. Prefers days when evenly divisible. */
export function minutesToAge(minutes: number | undefined | null): { value: string; unit: AgeUnit } {
  if (!minutes || minutes <= 0) return { value: "3", unit: "days" };
  if (minutes % MINUTES_PER_DAY === 0) {
    return { value: String(minutes / MINUTES_PER_DAY), unit: "days" };
  }
  return { value: String(Math.round(minutes / MINUTES_PER_HOUR)), unit: "hours" };
}

// Backend constraints from `validate_cache_ttl` in repositories.rs: 1s..=30d.
// The constants live here (not on the SDK) so the UI can show a clear inline
// validation error before submitting; the backend would otherwise reject with
// a 400 + opaque message.
const CACHE_TTL_MIN_SECONDS = 1;
const CACHE_TTL_MAX_SECONDS = 30 * 24 * 60 * 60; // 2,592,000

// Backend constraint from `validate_min_age_days` in age_gate_service.rs:
// 0..=3650. 0 is meaningful — the "trusted remote" setting (#1558): no age
// delay, but explicit rejections still block. The constants live here (not on
// the SDK) so the UI can show a clear inline validation error before
// submitting, mirroring the cache-TTL field above.
const AGE_GATE_MIN_DAYS = 0;
const AGE_GATE_MAX_DAYS = 3650;

export interface UpdateRepositoryFields {
  key?: string;
  name?: string;
  description?: string;
  is_public?: boolean;
  quota_bytes?: number | null;
  /** First-class artifact versioning opt-in (#571, Generic/Mlmodel only). */
  versioning_enabled?: boolean;
  // --- 1.6.0 format-specific config (#602) ---
  /** RPM curation trusted GPG key (#2568): string to set, `null` to clear. */
  trusted_gpg_key?: string | null;
  apt_origin?: string;
  apt_label?: string;
  apt_release_version?: string;
  apt_description?: string;
  debian?: DebianRepoConfig;
  npm_allowed_scopes?: string[];
  npm_allowed_name_patterns?: string[];
  npm_allow_unscoped?: boolean;
}

/** Convert UpdateRepositoryFields to the shape repositoriesApi.update expects. */
function toUpdatePayload(
  fields: UpdateRepositoryFields
): Partial<CreateRepositoryRequest> {
  const { quota_bytes, ...rest } = fields;
  // The SDK type does not accept null for quota_bytes, so strip it. A `null`
  // trusted_gpg_key IS preserved (three-way clear semantics, #2568).
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
  const t = useTranslations("app/repositories/_components/repo-settings-tab");
  const tSev = useTranslations("core/severity");

  // Format a TTL in seconds as a short human-readable hint ("24 hours",
  // "1 day 6 hours", "30 minutes") — a helper line under the TTL input so
  // operators don't have to compute "is 86400 a sensible number?".
  const formatTtlHint = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    const day = 24 * 60 * 60;
    const hour = 60 * 60;
    const minute = 60;
    const days = Math.floor(seconds / day);
    const hours = Math.floor((seconds % day) / hour);
    const minutes = Math.floor((seconds % hour) / minute);
    const secs = seconds % minute;

    const parts: string[] = [];
    if (days) parts.push(t("ttlDay", { count: days }));
    if (hours) parts.push(t("ttlHour", { count: hours }));
    if (minutes) parts.push(t("ttlMinute", { count: minutes }));
    if (secs && parts.length === 0)
      parts.push(t("ttlSecond", { count: secs }));
    return parts.join(" ");
  };

  // Installed format handlers — resolves the custom layout name when the
  // repo is backed by a WASM plugin (#592).
  const { data: formatHandlers } = useFormatHandlers();

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

  // -- 1.6.0 format-specific config (#602) --
  const isRpm = hasRpmTrustedKeyConfig(repository.format);
  const isDebian = hasDebianConfig(repository.format);
  const isNpmScoped = hasNpmScopePolicy(
    repository.format,
    repository.repo_type
  );

  // RPM trusted GPG key (#2568). The key is write-only: the textarea always
  // starts empty and a stored key surfaces via `has_trusted_gpg_key`. Typing a
  // key replaces it; toggling "remove" clears it (three-way semantics).
  const [rpmConfig, setRpmConfig] = useState<RpmConfigValue>(EMPTY_RPM_CONFIG);
  const [rpmClear, setRpmClear] = useState(false);
  const rpmKeyTyped = rpmConfig.trusted_gpg_key.trim().length > 0;
  const rpmChanged = isRpm && (rpmKeyTyped || rpmClear);

  // Debian/APT config (#2407/#2460/#2489/#2459), override-based like the
  // general fields so a repository prop change re-seeds the defaults.
  const debianDefaults = useMemo<DebianConfigValue>(
    () => ({
      apt_origin: repository.apt_origin ?? "",
      apt_label: repository.apt_label ?? "",
      apt_release_version: repository.apt_release_version ?? "",
      apt_description: repository.apt_description ?? "",
      distribution_paths: formatList(repository.debian?.distribution_paths),
      components: formatList(repository.debian?.components),
      architectures: formatList(repository.debian?.architectures),
    }),
    [repository]
  );
  const [debianOverrides, setDebianOverrides] = useState<
    Partial<DebianConfigValue>
  >({});
  const debianConfig = useMemo(
    () => ({ ...debianDefaults, ...debianOverrides }),
    [debianDefaults, debianOverrides]
  );
  const debianChanged =
    isDebian &&
    (Object.keys(debianConfig) as (keyof DebianConfigValue)[]).some(
      (k) => debianConfig[k] !== debianDefaults[k]
    );

  // npm scope policy (#2424).
  const npmDefaults = useMemo<NpmScopePolicyValue>(
    () => ({
      npm_allowed_scopes: formatList(repository.npm_allowed_scopes),
      npm_allowed_name_patterns: formatList(
        repository.npm_allowed_name_patterns
      ),
      npm_allow_unscoped: repository.npm_allow_unscoped ?? false,
    }),
    [repository]
  );
  const [npmOverrides, setNpmOverrides] = useState<
    Partial<NpmScopePolicyValue>
  >({});
  const npmScopePolicy = useMemo(
    () => ({ ...npmDefaults, ...npmOverrides }),
    [npmDefaults, npmOverrides]
  );
  const npmChanged =
    isNpmScoped &&
    (Object.keys(npmScopePolicy) as (keyof NpmScopePolicyValue)[]).some(
      (k) => npmScopePolicy[k] !== npmDefaults[k]
    );

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
    if (rpmChanged || debianChanged || npmChanged) return true;
    return false;
  }, [
    form,
    quotaValue,
    quotaUnit,
    repository,
    cacheTtlChanged,
    rpmChanged,
    debianChanged,
    npmChanged,
  ]);

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
      // Reset 1.6.0 format-specific config editors (#602). The RPM key is
      // write-only, so the textarea always returns to empty after a save.
      setRpmConfig(EMPTY_RPM_CONFIG);
      setRpmClear(false);
      setDebianOverrides({});
      setNpmOverrides({});
      toast.success(t("settingsSaved"));
    },
    onError: mutationErrorToast(t("settingsSaveFailed")),
  });

  // -- Cache TTL mutation (#448, separate endpoint from `update`) --
  const setCacheTtlMutation = useMutation({
    mutationFn: (seconds: number) =>
      repositoriesApi.setCacheTtl(repository.key, seconds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cache-ttl", repository.key] });
      setCacheTtlOverride(undefined);
      toast.success(t("cacheTtlSaved"));
    },
    onError: mutationErrorToast(t("cacheTtlSaveFailed")),
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

    // 1.6.0 format-specific config (#602). RPM key uses three-way semantics:
    // a typed key replaces, an explicit remove clears (null), else unchanged.
    if (isRpm) {
      const typedKey = rpmConfig.trusted_gpg_key.trim();
      if (typedKey) fields.trusted_gpg_key = typedKey;
      else if (rpmClear) fields.trusted_gpg_key = null;
    }
    if (isDebian && debianChanged) {
      Object.assign(fields, buildDebianConfigFields(debianConfig));
    }
    if (isNpmScoped && npmChanged) {
      Object.assign(fields, buildNpmScopePolicyFields(npmScopePolicy));
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
    isRpm,
    rpmConfig,
    rpmClear,
    isDebian,
    debianChanged,
    debianConfig,
    isNpmScoped,
    npmChanged,
    npmScopePolicy,
  ]);

  const handleDiscard = useCallback(() => {
    setOverrides({});
    setQuotaOverrides({});
    setCacheTtlOverride(undefined);
    setRpmConfig(EMPTY_RPM_CONFIG);
    setRpmClear(false);
    setDebianOverrides({});
    setNpmOverrides({});
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
      toast.success(t("policyDeleted"));
    },
    onError: mutationErrorToast(t("policyDeleteFailed")),
  });

  const executePolicyMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.execute(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["lifecycle-policies", repository.id],
      });
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      toast.success(
        t("policyExecuted", {
          count: result.artifacts_removed,
          freed: formatBytes(result.bytes_freed),
        })
      );
    },
    onError: mutationErrorToast(t("policyExecuteFailed")),
  });

  const previewPolicyMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.preview(id),
    onSuccess: (result) => {
      toast.info(
        t("policyPreview", {
          count: result.artifacts_matched,
          freed: formatBytes(result.bytes_freed),
        })
      );
    },
    onError: mutationErrorToast(t("policyPreviewFailed")),
  });

  // -- Package age policy (#265). Quarantine-on-release for remote repos. --
  // Seeded from the persisted `quarantine_enabled` / `quarantine_duration_minutes`
  // on the repository object so the form reflects the true server state after
  // mount and after a save-then-refetch cycle (review fix #464, regression #665).
  // The override pattern mirrors the general settings so `ageDirty` stays
  // false until the operator makes an explicit change.
  const ageDefaults = useMemo(
    () => ({
      enabled: repository.quarantine_enabled ?? false,
      ...minutesToAge(repository.quarantine_duration_minutes),
    }),
    [repository.quarantine_enabled, repository.quarantine_duration_minutes],
  );

  const [ageOverrides, setAgeOverrides] = useState<{
    enabled?: boolean;
    value?: string;
    unit?: AgeUnit;
  }>({});

  const ageEnabled = ageOverrides.enabled ?? ageDefaults.enabled;
  const ageValue = ageOverrides.value ?? ageDefaults.value;
  const ageUnit = ageOverrides.unit ?? ageDefaults.unit;
  const ageDirty = "enabled" in ageOverrides || "value" in ageOverrides || "unit" in ageOverrides;

  const setAgeEnabled = (v: boolean) => {
    setAgeOverrides((o) => ({ ...o, enabled: v }));
  };
  const setAgeValue = (v: string) => {
    setAgeOverrides((o) => ({ ...o, value: v }));
  };
  const setAgeUnit = (v: AgeUnit) => {
    setAgeOverrides((o) => ({ ...o, unit: v }));
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
      setAgeOverrides({});
      toast.success(
        ageEnabled ? t("agePolicyEnabled") : t("agePolicyDisabled")
      );
    },
    onError: mutationErrorToast(t("agePolicySaveFailed")),
  });

  // -- Effective upload size limit (#189). Read-only here; configured by an
  // admin on the global Settings page. Surfaced so repo owners can see the
  // ceiling that applies to uploads into this repository. --
  const { data: adminSettings } = useAdminSettings();
  const maxUploadBytes = adminSettings?.storageSettings.max_upload_size_bytes;

  // -- Scanning & enforcement (#2954 / #3003, "active blocking") --
  // Repo-admin gated: the backend PUT is admin-only, so we only render the
  // section (and only run the GET) for admins — mirroring how the quarantine
  // decisions and other admin-only controls are gated on `user?.is_admin`
  // elsewhere in the repository views.
  const { user } = useAuth();
  const isRepoAdmin = !!user?.is_admin;

  const { data: scanConfig, isLoading: scanConfigLoading } = useQuery({
    queryKey: ["scan-config", repository.key],
    queryFn: () => scanConfigApi.get(repository.key),
    enabled: isRepoAdmin,
  });

  // Override-based dirty tracking, like the general/debian/npm sections: the
  // loaded config is the baseline, and only the operator's explicit edits are
  // held in `scanOverrides` so a fresh load never counts as a change.
  const [scanOverrides, setScanOverrides] = useState<Partial<RepoScanConfig>>(
    {}
  );
  const scanForm: RepoScanConfig | undefined = useMemo(
    () => (scanConfig ? { ...scanConfig, ...scanOverrides } : undefined),
    [scanConfig, scanOverrides]
  );
  const scanChanged =
    !!scanConfig &&
    (Object.keys(scanOverrides) as (keyof RepoScanConfig)[]).some(
      (k) => scanOverrides[k] !== undefined && scanOverrides[k] !== scanConfig[k]
    );

  const setScanField = useCallback(
    <K extends keyof RepoScanConfig>(key: K, value: RepoScanConfig[K]) => {
      setScanOverrides((o) => ({ ...o, [key]: value }));
    },
    []
  );

  const scanConfigMutation = useMutation({
    mutationFn: (req: UpsertScanConfigRequest) =>
      scanConfigApi.update(repository.key, req),
    onSuccess: (updated) => {
      // Seed the query cache with the server's echoed row and clear the local
      // edits so the form re-baselines against what was actually persisted.
      queryClient.setQueryData(["scan-config", repository.key], updated);
      setScanOverrides({});
      toast.success(t("scanSettingsSaved"));
    },
    onError: mutationErrorToast(t("scanSettingsSaveFailed")),
  });

  const handleSaveScanConfig = useCallback(() => {
    if (!scanForm) return;
    // Send the full set — the backend upsert merges, but sending everything
    // keeps the persisted row unambiguous and avoids a stale-field surprise.
    scanConfigMutation.mutate({
      scan_enabled: scanForm.scan_enabled,
      scan_on_upload: scanForm.scan_on_upload,
      scan_on_proxy: scanForm.scan_on_proxy,
      block_on_policy_violation: scanForm.block_on_policy_violation,
      severity_threshold: scanForm.severity_threshold,
      proxy_scan_action: scanForm.proxy_scan_action,
    });
  }, [scanForm, scanConfigMutation]);

  // -- Age Gate (#701). Remote repos only: the backend PUT rejects other repo
  // types with 400 (`require_remote_repo_for_age_gate`) and is admin-only, so
  // the section mirrors the Scanning & enforcement gating above. --
  const { data: ageGateConfig, isLoading: ageGateLoading } = useQuery({
    queryKey: ["age-gate-config", repository.key],
    queryFn: () => ageGateApi.getRepoConfig(repository.key),
    enabled: isRemote && isRepoAdmin,
  });

  // Same override pattern as the cache-TTL field: a string-typed override for
  // the days input so typing stays controlled mid-edit, and an optional
  // boolean override for the toggle. A fresh load never counts as a change.
  const [ageGateEnabledOverride, setAgeGateEnabledOverride] = useState<
    boolean | undefined
  >(undefined);
  const [ageGateDaysOverride, setAgeGateDaysOverride] = useState<
    string | undefined
  >(undefined);
  const ageGateEnabled =
    ageGateEnabledOverride ?? ageGateConfig?.enabled ?? false;
  const ageGateDaysInput =
    ageGateDaysOverride ??
    (ageGateConfig ? String(ageGateConfig.minAgeDays) : "");
  const parsedAgeGateDays =
    ageGateDaysInput.trim() === "" ? null : Number(ageGateDaysInput);
  const ageGateDaysValid =
    parsedAgeGateDays != null &&
    Number.isInteger(parsedAgeGateDays) &&
    parsedAgeGateDays >= AGE_GATE_MIN_DAYS &&
    parsedAgeGateDays <= AGE_GATE_MAX_DAYS;
  const ageGateChanged =
    !!ageGateConfig &&
    ((ageGateEnabledOverride !== undefined &&
      ageGateEnabledOverride !== ageGateConfig.enabled) ||
      (ageGateDaysOverride !== undefined &&
        parsedAgeGateDays !== ageGateConfig.minAgeDays));

  const ageGateMutation = useMutation({
    mutationFn: (cfg: { enabled: boolean; minAgeDays: number }) =>
      ageGateApi.updateRepoConfig(repository.key, cfg),
    onSuccess: (updated) => {
      // Seed the query cache with the server's echoed config and clear the
      // local edits so the form re-baselines against what was persisted.
      queryClient.setQueryData(["age-gate-config", repository.key], updated);
      setAgeGateEnabledOverride(undefined);
      setAgeGateDaysOverride(undefined);
      toast.success(
        updated.enabled ? t("ageGateEnabled") : t("ageGateSettingsSaved")
      );
    },
    onError: mutationErrorToast(t("ageGateSaveFailed")),
  });

  const handleSaveAgeGate = useCallback(() => {
    if (!ageGateConfig || !ageGateDaysValid || parsedAgeGateDays == null)
      return;
    ageGateMutation.mutate({
      enabled: ageGateEnabled,
      minAgeDays: parsedAgeGateDays,
    });
  }, [
    ageGateConfig,
    ageGateDaysValid,
    parsedAgeGateDays,
    ageGateEnabled,
    ageGateMutation,
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      {/* -- General Settings Section -- */}
      <section aria-labelledby="settings-general-heading">
        <h3 id="settings-general-heading" className="text-base font-semibold mb-4">
          {t("general")}
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-key">{t("repoKeyLabel")}</Label>
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
                {t("keyChangedWarning")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-name">{t("nameLabel")}</Label>
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
            <Label htmlFor="settings-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="settings-description"
              value={form.description}
              onChange={(e) =>
                setOverrides((o) => ({ ...o, description: e.target.value }))
              }
              placeholder={t("descriptionPlaceholder")}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="settings-visibility">{t("publicAccess")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("publicAccessHint")}
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
          {t("storage")}
        </h3>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t.rich("currentlyUsing", {
              used: formatBytes(repository.storage_used_bytes),
              strong: (chunks) => (
                <span className="font-medium text-foreground">{chunks}</span>
              ),
            })}
            {repository.quota_bytes ? (
              t.rich("ofQuota", {
                quota: formatBytes(repository.quota_bytes),
                percent: Math.round(
                  (repository.storage_used_bytes / repository.quota_bytes) * 100
                ),
                strong: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })
            ) : (
              t("noQuotaSet")
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-quota">{t("storageQuotaLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="settings-quota"
                type="number"
                min="0"
                step="any"
                placeholder={t("noLimitPlaceholder")}
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
              {t("quotaHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t("uploadSizeLimit")}</Label>
            <Input
              value={
                maxUploadBytes == null
                  ? t("loading")
                  : maxUploadBytes === 0
                    ? t("noLimit")
                    : formatBytes(maxUploadBytes)
              }
              disabled
              className="bg-muted/50"
              aria-label={t("uploadSizeLimitAria")}
            />
            <p className="text-xs text-muted-foreground">
              {t("uploadSizeHint")}
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
                {t("versioning")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("versioningHint")}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="settings-versioning-enabled">
                  {t("enableVersioning")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("versioningToggleHint")}
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

      {/* -- RPM Curation Trust Section (#2568, RPM only) -- */}
      {isRpm && (
        <>
          <section aria-labelledby="settings-rpm-heading">
            <div className="mb-4">
              <h3 id="settings-rpm-heading" className="text-base font-semibold">
                {t("rpmTrustTitle")}
              </h3>
            </div>
            <RpmTrustedKeyField
              idPrefix="settings"
              value={rpmConfig}
              onChange={setRpmConfig}
              hasExistingKey={
                (repository.has_trusted_gpg_key ?? false) && !rpmClear
              }
              onRemove={
                repository.has_trusted_gpg_key
                  ? () => setRpmClear(true)
                  : undefined
              }
            />
            {rpmClear && (
              <div className="mt-2 flex items-center justify-between rounded border border-destructive/40 bg-destructive/5 p-2">
                <p className="text-xs text-destructive">
                  {t("rpmWillRemove")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRpmClear(false)}
                >
                  {t("undo")}
                </Button>
              </div>
            )}
          </section>
          <Separator />
        </>
      )}

      {/* -- Debian/APT Section (#2407/#2460/#2489/#2459, Debian only) -- */}
      {isDebian && (
        <>
          <section aria-labelledby="settings-debian-heading">
            <div className="mb-4">
              <h3
                id="settings-debian-heading"
                className="text-base font-semibold"
              >
                {t("debianConfigTitle")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("debianHint")}
              </p>
            </div>
            <DebianConfigFields
              idPrefix="settings"
              value={debianConfig}
              onChange={(v) => setDebianOverrides(v)}
            />
          </section>
          <Separator />
        </>
      )}

      {/* -- npm Scope Policy Section (#2424, npm remote/virtual only) -- */}
      {isNpmScoped && (
        <>
          <section aria-labelledby="settings-npm-heading">
            <div className="mb-4">
              <h3 id="settings-npm-heading" className="text-base font-semibold">
                {t("npmScopeTitle")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("npmHint")}
              </p>
            </div>
            <NpmScopePolicyFields
              idPrefix="settings"
              value={npmScopePolicy}
              onChange={(v) => setNpmOverrides(v)}
            />
          </section>
          <Separator />
        </>
      )}

      {/* -- Package Age Policy Section (#265) -- */}
      <section aria-labelledby="settings-age-heading">
        <div className="mb-4">
          <h3 id="settings-age-heading" className="text-base font-semibold">
            {t("agePolicy")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("agePolicyHint")}
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="settings-age-enabled">{t("enableAgePolicy")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("enableAgePolicyHint")}
              </p>
            </div>
            <Switch
              id="settings-age-enabled"
              checked={ageEnabled}
              onCheckedChange={setAgeEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-age-duration">{t("cooldownPeriod")}</Label>
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
                  <SelectItem value="hours">{t("hours")}</SelectItem>
                  <SelectItem value="days">{t("days")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Persistent live region so the validation error is announced and
                stays associated with the input via aria-describedby. */}
            <p id="settings-age-error" role="alert" className="text-sm text-destructive empty:hidden">
              {ageInvalid
                ? t("ageInvalid", {
                    unit:
                      ageUnit === "days" ? t("day") : t("hour"),
                  })
                : ""}
            </p>
            {!ageInvalid && (
              <p id="settings-age-hint" className="text-xs text-muted-foreground">
                {t("ageHint")}
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
                  {t("saving")}
                </>
              ) : (
                t("saveAgePolicy")
              )}
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* -- Age Gate Section (#701, remote repos, repo-admin only) -- */}
      {isRemote && isRepoAdmin && (
        <>
          <section aria-labelledby="settings-age-gate-heading">
            <div className="mb-4">
              <h3
                id="settings-age-gate-heading"
                className="text-base font-semibold"
              >
                {t("ageGate")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("ageGateHint")}
              </p>
            </div>

            {ageGateLoading || !ageGateConfig ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="settings-age-gate-enabled">
                      {t("enableAgeGate")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("enableAgeGateHint")}
                    </p>
                  </div>
                  <Switch
                    id="settings-age-gate-enabled"
                    checked={ageGateEnabled}
                    onCheckedChange={setAgeGateEnabledOverride}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="settings-age-gate-days">
                    {t("minAgeDays")}
                  </Label>
                  <Input
                    id="settings-age-gate-days"
                    type="number"
                    min={AGE_GATE_MIN_DAYS}
                    max={AGE_GATE_MAX_DAYS}
                    step={1}
                    value={ageGateDaysInput}
                    onChange={(e) => setAgeGateDaysOverride(e.target.value)}
                    disabled={!ageGateEnabled}
                    aria-invalid={
                      ageGateDaysOverride !== undefined && !ageGateDaysValid
                    }
                    aria-describedby="settings-age-gate-days-error"
                  />
                  {/* Persistent live region, mirroring the age-policy and
                      cache-TTL fields. */}
                  <p
                    id="settings-age-gate-days-error"
                    role="alert"
                    className="text-sm text-destructive empty:hidden"
                  >
                    {ageGateDaysOverride !== undefined && !ageGateDaysValid
                      ? t("ageGateInvalid", {
                          min: AGE_GATE_MIN_DAYS,
                          max: AGE_GATE_MAX_DAYS.toLocaleString(),
                        })
                      : ""}
                  </p>
                  {ageGateDaysValid && (
                    <p className="text-xs text-muted-foreground">
                      {t("ageGateValidHint")}
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveAgeGate}
                    disabled={
                      ageGateMutation.isPending ||
                      !ageGateChanged ||
                      !ageGateDaysValid
                    }
                  >
                    {ageGateMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t("saving")}
                      </>
                    ) : (
                      t("saveAgeGateSettings")
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <Separator />
        </>
      )}

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
              {t("proxyCache")}
            </h3>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {t("proxyCacheHint")}
              </p>

              <div className="space-y-2">
                <Label htmlFor="settings-cache-ttl">{t("cacheTtlLabel")}</Label>
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
                        {t("cacheRange", {
                          min: CACHE_TTL_MIN_SECONDS,
                          max: CACHE_TTL_MAX_SECONDS.toLocaleString(),
                        })}
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
                        ? t("cacheInvalid", {
                            min: CACHE_TTL_MIN_SECONDS,
                            max: CACHE_TTL_MAX_SECONDS.toLocaleString(),
                          })
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

      {/* -- Scanning & Enforcement Section (#2954 / #3003, repo-admin only) -- */}
      {isRepoAdmin && (
        <>
          <section aria-labelledby="settings-scan-heading">
            <div className="mb-4">
              <h3
                id="settings-scan-heading"
                className="text-base font-semibold"
              >
                {t("scanningEnforcement")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("scanningHint")}
              </p>
            </div>

            {scanConfigLoading || !scanForm ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Master toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="settings-scan-enabled">
                      {t("enableScanning")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("enableScanningHint")}
                    </p>
                  </div>
                  <Switch
                    id="settings-scan-enabled"
                    checked={scanForm.scan_enabled}
                    onCheckedChange={(v) => setScanField("scan_enabled", v)}
                  />
                </div>

                {/* Scan on upload */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="settings-scan-on-upload">
                      {t("scanOnUpload")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("scanOnUploadHint")}
                    </p>
                  </div>
                  <Switch
                    id="settings-scan-on-upload"
                    checked={scanForm.scan_on_upload}
                    disabled={!scanForm.scan_enabled}
                    onCheckedChange={(v) => setScanField("scan_on_upload", v)}
                  />
                </div>

                {/* Scan on proxy */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="settings-scan-on-proxy">
                      {t("scanOnProxy")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("scanOnProxyHint")}
                    </p>
                  </div>
                  <Switch
                    id="settings-scan-on-proxy"
                    checked={scanForm.scan_on_proxy}
                    disabled={!scanForm.scan_enabled}
                    onCheckedChange={(v) => setScanField("scan_on_proxy", v)}
                  />
                </div>

                {/* Block on policy violation */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="settings-scan-block">
                      {t("blockOnViolation")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("blockOnViolationHint")}
                    </p>
                  </div>
                  <Switch
                    id="settings-scan-block"
                    checked={scanForm.block_on_policy_violation}
                    disabled={!scanForm.scan_enabled}
                    onCheckedChange={(v) =>
                      setScanField("block_on_policy_violation", v)
                    }
                  />
                </div>

                {/* Severity threshold */}
                <div className="space-y-2">
                  <Label htmlFor="settings-scan-severity">
                    {t("severityThreshold")}
                  </Label>
                  <Select
                    value={scanForm.severity_threshold}
                    onValueChange={(v) =>
                      setScanField("severity_threshold", v)
                    }
                    disabled={!scanForm.scan_enabled}
                  >
                    <SelectTrigger
                      id="settings-scan-severity"
                      className="w-40"
                      aria-label={t("severityAria")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_THRESHOLDS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {tSev(level)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("severityHint")}
                  </p>
                </div>

                {/* Proxy scan action: fail-open vs fail-closed */}
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="settings-scan-fail-closed">
                        {t("failClosed")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {scanForm.proxy_scan_action === "fail_closed"
                          ? t("failClosedHint")
                          : t("failOpenHint")}
                      </p>
                    </div>
                    <Switch
                      id="settings-scan-fail-closed"
                      checked={scanForm.proxy_scan_action === "fail_closed"}
                      disabled={
                        !scanForm.scan_enabled || !scanForm.scan_on_proxy
                      }
                      onCheckedChange={(v) =>
                        setScanField(
                          "proxy_scan_action",
                          (v ? "fail_closed" : "fail_open") as ProxyScanAction
                        )
                      }
                    />
                  </div>
                  {(!scanForm.scan_enabled || !scanForm.scan_on_proxy) && (
                    <p className="text-xs text-muted-foreground">
                      {t("failClosedDisabledHint")}
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveScanConfig}
                    disabled={scanConfigMutation.isPending || !scanChanged}
                  >
                    {scanConfigMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t("saving")}
                      </>
                    ) : (
                      t("saveScanSettings")
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <Separator />
        </>
      )}

      {/* -- Cleanup Policies Section -- */}
      <section aria-labelledby="settings-cleanup-heading">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 id="settings-cleanup-heading" className="text-base font-semibold">
              {t("cleanupPolicies")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("cleanupPoliciesHint")}
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
              {t("noPolicies")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("noPoliciesHint")}
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
          {t("repoInfo")}
        </h3>
        <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("infoFormat")}</dt>
          <dd className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {repoFormatLabel(repository, formatHandlers).toUpperCase()}
            </Badge>
            {isPluginBackedRepo(repository) && (
              <span className="text-xs text-muted-foreground">
                {t("pluginGenericHint")}
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">{t("infoType")}</dt>
          <dd className="capitalize">{repository.repo_type}</dd>
          <dt className="text-muted-foreground">{t("infoCreated")}</dt>
          <dd>{new Date(repository.created_at).toLocaleDateString()}</dd>
          <dt className="text-muted-foreground">{t("infoLastUpdated")}</dt>
          <dd>{new Date(repository.updated_at).toLocaleDateString()}</dd>
          {repository.upstream_url && (
            <>
              <dt className="text-muted-foreground">{t("infoUpstreamUrl")}</dt>
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
            <span>{t("unsavedChanges")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleDiscard}
              disabled={
                saveMutation.isPending || setCacheTtlMutation.isPending
              }
            >
              {t("discard")}
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
                  {t("saving")}
                </>
              ) : (
                t("saveChanges")
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
  const t = useTranslations("app/repositories/_components/repo-settings-tab");
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
              {policy.enabled ? t("policyActive") : t("policyDisabled")}
            </Badge>
            {policy.last_run_at && (
              <span className="text-xs text-muted-foreground">
                {t("lastRun", { date: new Date(policy.last_run_at).toLocaleDateString() })}
                {policy.last_run_items_removed != null &&
                  t("lastRunRemoved", { count: policy.last_run_items_removed })}
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
              aria-label={t("previewAria", { name: policy.name })}
            >
              <Eye className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("previewDryRun")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onExecute}
              disabled={executePending}
              aria-label={t("executeAria", { name: policy.name })}
            >
              <Play className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("executeNow")}</TooltipContent>
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
                  aria-label={t("deleteAria", { name: policy.name })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("deletePolicy")}</TooltipContent>
            </Tooltip>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deletePolicyTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deletePolicyDescription", { name: policy.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
