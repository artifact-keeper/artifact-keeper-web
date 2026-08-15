"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { Repository, CreateRepositoryRequest, RepositoryFormat, RepositoryType, VirtualRepoMemberInput } from "@/types";
import type { FormatHandler } from "@/lib/api/format-handlers";
import {
  FORMAT_OPTIONS,
  TYPE_OPTIONS,
  hasRpmTrustedKeyConfig,
  hasDebianConfig,
  hasNpmScopePolicy,
} from "../_lib/constants";
import { DEFAULT_UPSTREAM_URLS } from "../_lib/default-upstream-urls";

// Alphabetised copy of FORMAT_OPTIONS for the create dialog's flat dropdown.
// The source array is deliberately ordered by ecosystem group so that the
// grouped filter in repositories-content.tsx renders its headers correctly;
// here we just want a predictable A-Z list for the user.
const SORTED_FORMAT_OPTIONS = [...FORMAT_OPTIONS].sort((a, b) =>
  a.label.localeCompare(b.label),
);

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useFeatureFlags } from "@/providers/system-config-provider";
import {
  RpmTrustedKeyField,
  DebianConfigFields,
  NpmScopePolicyFields,
  buildRpmConfigFields,
  buildDebianConfigFields,
  buildNpmScopePolicyFields,
  hasNpmScopePolicyInput,
  EMPTY_RPM_CONFIG,
  EMPTY_DEBIAN_CONFIG,
  EMPTY_NPM_SCOPE_POLICY,
  type RpmConfigValue,
  type DebianConfigValue,
  type NpmScopePolicyValue,
} from "./format-config-fields";

type QuotaUnit = "MB" | "GB";

const BYTES_PER_MB = 1048576;
const BYTES_PER_GB = 1073741824;

/** Convert a quota value and unit to bytes. Returns null for empty/zero values. */
export function quotaToBytes(value: string, unit: QuotaUnit): number | null {
  const num = Number(value);
  if (!num || num <= 0 || !Number.isFinite(num)) return null;
  return Math.round(num * (unit === "GB" ? BYTES_PER_GB : BYTES_PER_MB));
}

/** Convert bytes to a human-friendly value and unit. Prefers GB when evenly divisible. */
export function bytesToQuota(bytes: number | undefined | null): { value: string; unit: QuotaUnit } {
  if (!bytes || bytes <= 0) return { value: "", unit: "GB" };
  if (bytes >= BYTES_PER_GB && bytes % BYTES_PER_GB === 0) {
    return { value: String(bytes / BYTES_PER_GB), unit: "GB" };
  }
  return { value: String(Math.round(bytes / BYTES_PER_MB)), unit: "MB" };
}

interface RepoDialogsProps {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onCreateSubmit: (data: CreateRepositoryRequest) => void;
  createPending: boolean;
  editOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  editRepo: Repository | null;
  onEditSubmit: (key: string, data: { key?: string; name: string; description: string; is_public: boolean; quota_bytes?: number }) => void;
  editPending: boolean;
  onUpstreamAuthUpdate?: (key: string, payload: { auth_type: string; username?: string; password?: string }) => void;
  upstreamAuthPending?: boolean;
  /**
   * Result of the most recent upstream-auth save, surfaced to a live region
   * inside the edit dialog so screen readers hear the outcome (#410). The
   * save itself resolves via a parent mutation whose only feedback was a
   * visual toast, which assistive tech outside the dialog does not reliably
   * announce.
   */
  upstreamAuthStatus?: { state: "idle" | "success" | "error"; message?: string };
  deleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  deleteRepo: Repository | null;
  onDeleteConfirm: (key: string) => void;
  deletePending: boolean;
  // Available repos for virtual repo member selection
  availableRepos?: Repository[];
  /**
   * Enabled WASM plugin format handlers offered as custom layouts in the
   * create dialog's format selector (#591). Empty/omitted when no plugins
   * are installed — the plugin options are simply absent then.
   */
  pluginFormats?: FormatHandler[];
}

export function RepoDialogs({
  createOpen,
  onCreateOpenChange,
  onCreateSubmit,
  createPending,
  editOpen,
  onEditOpenChange,
  editRepo,
  onEditSubmit,
  editPending,
  onUpstreamAuthUpdate,
  upstreamAuthPending = false,
  upstreamAuthStatus = { state: "idle" },
  deleteOpen,
  onDeleteOpenChange,
  deleteRepo,
  onDeleteConfirm,
  deletePending,
  availableRepos = [],
  pluginFormats = [],
}: RepoDialogsProps) {
  const t = useTranslations("repoDialogs");
  // Create form state
  // Private by default: matches the backend default and keeps new
  // repositories from being exposed unintentionally.
  const [createForm, setCreateForm] = useState<CreateRepositoryRequest>({
    key: "",
    name: "",
    description: "",
    format: "generic",
    repo_type: "local",
    is_public: false,
    upstream_url: "",
    member_repos: [],
  });

  // When guest access is disabled the backend silently coerces is_public to
  // false, so offering the toggle would be misleading — show a note instead.
  // While the config loads the provider falls back to DEFAULT_SYSTEM_CONFIG
  // (guest access enabled), so the switch renders optimistically: briefly
  // showing a switch that then disappears is harmless (the backend coerces
  // anyway), whereas flashing "disabled by the operator" at operators who did
  // not disable it would be actively wrong. This matches the provider's
  // documented permissive-default philosophy.
  const { guestAccessEnabled } = useFeatureFlags();

  // For virtual repos: selected member repo keys
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Quota state for create dialog
  const [createQuotaValue, setCreateQuotaValue] = useState("");
  const [createQuotaUnit, setCreateQuotaUnit] = useState<QuotaUnit>("GB");

  // Upstream auth state for create dialog
  const [upstreamAuthType, setUpstreamAuthType] = useState<string>("none");
  const [upstreamUsername, setUpstreamUsername] = useState("");
  const [upstreamPassword, setUpstreamPassword] = useState("");

  // 1.6.0 format-specific config state for the create dialog (#602).
  const [rpmConfig, setRpmConfig] = useState<RpmConfigValue>(EMPTY_RPM_CONFIG);
  const [debianConfig, setDebianConfig] =
    useState<DebianConfigValue>(EMPTY_DEBIAN_CONFIG);
  const [npmScopePolicy, setNpmScopePolicy] = useState<NpmScopePolicyValue>(
    EMPTY_NPM_SCOPE_POLICY,
  );

  /**
   * Suggest a default upstream URL when the repo type is "remote".
   * Only auto-fills if the current URL is empty or matches a known default
   * (i.e. the user hasn't typed a custom value).
   */
  const maybeSetDefaultUpstreamUrl = useCallback(
    (format: string, repoType: string, currentUrl: string) => {
      if (repoType !== "remote") return;
      const defaultUrl = DEFAULT_UPSTREAM_URLS[format] ?? "";
      const isDefault = currentUrl === "" || Object.values(DEFAULT_UPSTREAM_URLS).includes(currentUrl);
      if (isDefault && defaultUrl) {
        setCreateForm((f) => ({ ...f, upstream_url: defaultUrl }));
      }
    },
    []
  );

  // Upstream auth state for edit dialog
  const [editAuthMode, setEditAuthMode] = useState<"view" | "edit">("view");
  const [editAuthType, setEditAuthType] = useState<string>("none");
  const [editAuthUsername, setEditAuthUsername] = useState("");
  const [editAuthPassword, setEditAuthPassword] = useState("");
  const [removeAuthConfirm, setRemoveAuthConfirm] = useState(false);

  // Focus management for the upstream-auth view <-> edit toggle (#412).
  // When the user switches modes the previously focused control unmounts, so
  // focus would otherwise fall back to <body> and screen-reader / keyboard
  // users lose their place. We move focus to the first control of whichever
  // view just became visible. We target elements by id (rather than a ref)
  // because the underlying shadcn SelectTrigger does not forward a ref.
  // Skip the very first render (dialog open) so we don't steal focus from the
  // dialog's own initial focus target; only react to genuine toggles.
  const editAuthModeInitialized = useRef(false);
  useEffect(() => {
    if (!editOpen) {
      editAuthModeInitialized.current = false;
      return;
    }
    if (!editAuthModeInitialized.current) {
      editAuthModeInitialized.current = true;
      return;
    }
    const targetId =
      editAuthMode === "edit" ? "edit-upstream-auth-type" : "edit-upstream-auth-toggle";
    // Defer to the next frame so the newly-rendered control exists in the DOM.
    const id = requestAnimationFrame(() => {
      document.getElementById(targetId)?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [editAuthMode, editOpen]);

  // Quota state for edit dialog — initialized from editRepo
  const editQuotaDefaults = useMemo(() => bytesToQuota(editRepo?.quota_bytes), [editRepo]);
  const [editQuotaOverrides, setEditQuotaOverrides] = useState<{ value?: string; unit?: QuotaUnit }>({});
  const editQuotaValue = editQuotaOverrides.value ?? editQuotaDefaults.value;
  const editQuotaUnit = editQuotaOverrides.unit ?? editQuotaDefaults.unit;

  // Key validation - check if key is already taken
  const keyTaken = useMemo(() => {
    if (!createForm.key || createForm.key.length < 2) {
      return false;
    }
    return availableRepos.some(
      (r) => r.key.toLowerCase() === createForm.key.toLowerCase()
    );
  }, [createForm.key, availableRepos]);

  // Filter repos that can be members (local and remote, same format)
  const eligibleMembers = useMemo(() => {
    return availableRepos.filter(
      (r) => (r.repo_type === "local" || r.repo_type === "remote") &&
             r.format === createForm.format
    );
  }, [availableRepos, createForm.format]);

  // Edit form state — derived from editRepo, with local overrides
  const editFormDefaults = useMemo(() => ({
    key: editRepo?.key ?? "",
    name: editRepo?.name ?? "",
    description: editRepo?.description ?? "",
    is_public: editRepo?.is_public ?? false,
  }), [editRepo]);
  const [editFormOverrides, setEditFormOverrides] = useState<{
    key?: string;
    name?: string;
    description?: string;
    is_public?: boolean;
  }>({});
  const editForm = { ...editFormDefaults, ...editFormOverrides };
  const editKeyChanged = editRepo ? editForm.key !== editRepo.key : false;

  const resetCreateForm = () => {
    setCreateForm({
      key: "",
      name: "",
      description: "",
      format: "generic",
      repo_type: "local",
      is_public: false,
      upstream_url: "",
      member_repos: [],
    });
    setSelectedMembers([]);
    setCreateQuotaValue("");
    setCreateQuotaUnit("GB");
    setUpstreamAuthType("none");
    setUpstreamUsername("");
    setUpstreamPassword("");
    setRpmConfig(EMPTY_RPM_CONFIG);
    setDebianConfig(EMPTY_DEBIAN_CONFIG);
    setNpmScopePolicy(EMPTY_NPM_SCOPE_POLICY);
  };

  // Build member_repos array from selected keys
  const buildMemberRepos = (): VirtualRepoMemberInput[] => {
    return selectedMembers.map((key, idx) => ({
      repo_key: key,
      priority: idx + 1,
    }));
  };

  // Reset the create form whenever the dialog opens. The parent flips
  // `createOpen` back to false programmatically on a successful submit
  // (mutation onSuccess), but Radix Dialog does NOT fire onOpenChange for
  // programmatic close — so handleCreateClose's reset path is bypassed and
  // stale form values would otherwise persist into the next open.
  useEffect(() => {
    if (createOpen) {
      resetCreateForm();
    }
    // resetCreateForm only sets local state via stable setters; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  const handleCreateClose = (open: boolean) => {
    onCreateOpenChange(open);
    if (!open) {
      resetCreateForm();
    }
  };

  // --- Create Repository Dialog ---
  return (
    <>
      <Dialog open={createOpen} onOpenChange={handleCreateClose}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>
              {t("createDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              // #591: a selected WASM plugin layout is submitted as
              // `format: "generic"` plus the plugin's `format_key` — the
              // backend binds plugin-backed repos that way (migration 065).
              const selectedPlugin = pluginFormats.find(
                (h) => h.format_key === createForm.format,
              );
              const submitData: CreateRepositoryRequest = {
                ...createForm,
                format: selectedPlugin ? "generic" : createForm.format,
                format_key: selectedPlugin?.format_key,
                quota_bytes: quotaToBytes(createQuotaValue, createQuotaUnit) ?? undefined,
                upstream_url: createForm.repo_type === "remote" ? createForm.upstream_url : undefined,
              };
              // #754: the backend rejects an *explicit* empty member list, so
              // a member-less virtual repo must omit `member_repos` entirely
              // (the spread above carries the form's own empty array — drop
              // the key rather than send `[]`).
              const memberRepos =
                createForm.repo_type === "virtual" ? buildMemberRepos() : [];
              if (memberRepos.length > 0) {
                submitData.member_repos = memberRepos;
              } else {
                delete submitData.member_repos;
              }
              if (createForm.repo_type === "remote" && upstreamAuthType !== "none") {
                submitData.upstream_auth_type = upstreamAuthType;
                if (upstreamAuthType === "basic") {
                  submitData.upstream_username = upstreamUsername;
                }
                submitData.upstream_password = upstreamPassword;
              }
              // 1.6.0 format-specific config (#602): attach only the group that
              // matches the selected format so other formats send nothing.
              if (hasRpmTrustedKeyConfig(createForm.format)) {
                Object.assign(submitData, buildRpmConfigFields(rpmConfig));
              } else if (hasDebianConfig(createForm.format)) {
                Object.assign(submitData, buildDebianConfigFields(debianConfig));
              } else if (
                hasNpmScopePolicy(createForm.format, createForm.repo_type) &&
                hasNpmScopePolicyInput(npmScopePolicy)
              ) {
                // Only attach the policy when something was entered: the
                // backend gate is presence-based, and an all-empty policy is
                // not a no-op there (it denies every unscoped name).
                Object.assign(
                  submitData,
                  buildNpmScopePolicyFields(npmScopePolicy),
                );
              }
              onCreateSubmit(submitData);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="create-key">{t("keyLabel")}</Label>
              <Input
                id="create-key"
                placeholder="my-repo"
                value={createForm.key}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, key: e.target.value }))
                }
                required
                aria-required="true"
                aria-invalid={keyTaken}
                aria-describedby={keyTaken ? "create-key-error" : undefined}
                className={keyTaken ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {keyTaken && (
                <p id="create-key-error" role="alert" className="text-sm text-red-500">
                  {t("keyTaken", { key: createForm.key })}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">{t("nameLabel")}</Label>
              <Input
                id="create-name"
                placeholder={t("namePlaceholder")}
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-desc">{t("descriptionLabel")}</Label>
              <Textarea
                id="create-desc"
                placeholder={t("descriptionPlaceholder")}
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("formatLabel")}</Label>
                <Select
                  value={createForm.format}
                  onValueChange={(v) => {
                    setCreateForm((f) => ({
                      ...f,
                      format: v as RepositoryFormat,
                    }));
                    maybeSetDefaultUpstreamUrl(v, createForm.repo_type, createForm.upstream_url ?? "");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTED_FORMAT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                    {/* #591: custom layouts from installed WASM plugins,
                        labeled as plugin-provided; absent when none. */}
                    {pluginFormats.map((h) => (
                      <SelectItem key={h.format_key} value={h.format_key}>
                        {t("customPlugin", { name: h.display_name })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("typeLabel")}</Label>
                <Select
                  value={createForm.repo_type}
                  onValueChange={(v) => {
                    setCreateForm((f) => ({
                      ...f,
                      repo_type: v as RepositoryType,
                    }));
                    maybeSetDefaultUpstreamUrl(createForm.format, v, createForm.upstream_url ?? "");
                    if (v !== "remote") {
                      setUpstreamAuthType("none");
                      setUpstreamUsername("");
                      setUpstreamPassword("");
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Staging repository: inline hint */}
            {createForm.repo_type === "staging" && (
              <p className="text-xs text-muted-foreground">
                {t("stagingHint")}
              </p>
            )}
            {/* Remote repository: upstream URL */}
            {createForm.repo_type === "remote" && (
              <div className="space-y-2">
                <Label htmlFor="create-upstream">{t("upstreamUrlLabel")}</Label>
                <Input
                  id="create-upstream"
                  placeholder={DEFAULT_UPSTREAM_URLS[createForm.format] ?? "https://upstream-registry.example.com"}
                  value={createForm.upstream_url || ""}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, upstream_url: e.target.value }))
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {t("upstreamUrlHint")}
                </p>
              </div>
            )}

            {/* Remote repository: upstream authentication */}
            {createForm.repo_type === "remote" && (
              <div className="space-y-3">
                <Label htmlFor="create-upstream-auth-type">{t("upstreamAuthLabel")}</Label>
                <Select value={upstreamAuthType} onValueChange={setUpstreamAuthType}>
                  <SelectTrigger className="w-full" id="create-upstream-auth-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("authNone")}</SelectItem>
                    <SelectItem value="basic">{t("authBasic")}</SelectItem>
                    <SelectItem value="bearer">{t("authBearer")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("credentialsHint")}
                </p>

                {upstreamAuthType === "basic" && (
                  <>
                    <Label htmlFor="create-upstream-username">{t("usernameLabel")}</Label>
                    <Input
                      id="create-upstream-username"
                      placeholder={t("usernamePlaceholder")}
                      required
                      value={upstreamUsername}
                      onChange={(e) => setUpstreamUsername(e.target.value)}
                      autoComplete="off"
                    />
                    <Label htmlFor="create-upstream-password">{t("passwordLabel")}</Label>
                    <Input
                      id="create-upstream-password"
                      type="password"
                      placeholder={t("passwordPlaceholder")}
                      required
                      value={upstreamPassword}
                      onChange={(e) => setUpstreamPassword(e.target.value)}
                      autoComplete="off"
                    />
                  </>
                )}

                {upstreamAuthType === "bearer" && (
                  <>
                    <Label htmlFor="create-upstream-token">{t("tokenLabel")}</Label>
                    <Input
                      id="create-upstream-token"
                      type="password"
                      placeholder={t("tokenPlaceholder")}
                      required
                      value={upstreamPassword}
                      onChange={(e) => setUpstreamPassword(e.target.value)}
                      autoComplete="off"
                    />
                  </>
                )}
              </div>
            )}

            {/* Virtual repository: member selection */}
            {createForm.repo_type === "virtual" && (
              <div className="space-y-2">
                <Label>{t("memberReposLabel")}</Label>
                {eligibleMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("noEligibleMembers", { format: createForm.format })}
                  </p>
                ) : (
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {eligibleMembers.map((repo) => (
                      <label
                        key={repo.key}
                        className="flex items-center gap-2 p-1 hover:bg-muted rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(repo.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMembers((m) => [...m, repo.key]);
                            } else {
                              setSelectedMembers((m) => m.filter((k) => k !== repo.key));
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{repo.name}</span>
                        <span className="text-xs text-muted-foreground">({repo.repo_type})</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("memberSelectHint")}
                </p>
              </div>
            )}

            {/* RPM curation trusted GPG key (#2568) */}
            {hasRpmTrustedKeyConfig(createForm.format) && (
              <div className="space-y-3 border-t pt-4">
                <RpmTrustedKeyField
                  idPrefix="create"
                  value={rpmConfig}
                  onChange={setRpmConfig}
                />
              </div>
            )}

            {/* Advanced Debian/APT config (#2407/#2460/#2489/#2459) */}
            {hasDebianConfig(createForm.format) && (
              <div className="space-y-3 border-t pt-4">
                <Label>{t("debianConfigTitle")}</Label>
                <DebianConfigFields
                  idPrefix="create"
                  value={debianConfig}
                  onChange={setDebianConfig}
                />
              </div>
            )}

            {/* npm scope policy (#2424) */}
            {hasNpmScopePolicy(createForm.format, createForm.repo_type) && (
              <div className="space-y-3 border-t pt-4">
                <Label>{t("npmScopeTitle")}</Label>
                <NpmScopePolicyFields
                  idPrefix="create"
                  value={npmScopePolicy}
                  onChange={setNpmScopePolicy}
                />
              </div>
            )}

            {guestAccessEnabled ? (
              <div className="flex items-center gap-3">
                <Switch
                  id="create-public"
                  checked={createForm.is_public}
                  onCheckedChange={(v) =>
                    setCreateForm((f) => ({ ...f, is_public: v }))
                  }
                />
                <Label htmlFor="create-public">{t("publicRepoLabel")}</Label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("publicDisabled")}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="create-quota">{t("storageQuotaLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="create-quota"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={t("noLimitPlaceholder")}
                  value={createQuotaValue}
                  onChange={(e) => setCreateQuotaValue(e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={createQuotaUnit}
                  onValueChange={(v) => setCreateQuotaUnit(v as QuotaUnit)}
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
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => handleCreateClose(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={createPending || keyTaken}>
                {createPending ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Edit Repository Dialog -- */}
      <Dialog open={editOpen} onOpenChange={(open) => {
        if (!open) {
          setEditFormOverrides({});
          setEditQuotaOverrides({});
          setEditAuthMode("view");
          setEditAuthType("none");
          setEditAuthUsername("");
          setEditAuthPassword("");
          setRemoveAuthConfirm(false);
        }
        onEditOpenChange(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitle", { key: editRepo?.key ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("editDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (editRepo) {
                const { key: formKey, ...rest } = editForm;
                onEditSubmit(editRepo.key, {
                  ...rest,
                  ...(editKeyChanged ? { key: formKey } : {}),
                  quota_bytes: quotaToBytes(editQuotaValue, editQuotaUnit) ?? undefined,
                });
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-key">{t("editKeyLabel")}</Label>
              <Input
                id="edit-key"
                value={editForm.key}
                onChange={(e) =>
                  setEditFormOverrides((f) => ({ ...f, key: e.target.value.toLowerCase() }))
                }
                required
                aria-required="true"
                aria-describedby={editKeyChanged ? "edit-key-warning" : undefined}
              />
              {editKeyChanged && (
                <p
                  id="edit-key-warning"
                  role="status"
                  className="text-sm text-yellow-600 dark:text-yellow-500"
                >
                  {t("editKeyWarning")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t("nameLabel")}</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditFormOverrides((f) => ({ ...f, name: e.target.value }))
                }
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">{t("descriptionLabel")}</Label>
              <Textarea
                id="edit-desc"
                value={editForm.description}
                onChange={(e) =>
                  setEditFormOverrides((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </div>
            {guestAccessEnabled ? (
              <div className="flex items-center gap-3">
                <Switch
                  id="edit-public"
                  checked={editForm.is_public}
                  onCheckedChange={(v) =>
                    setEditFormOverrides((f) => ({ ...f, is_public: v }))
                  }
                />
                <Label htmlFor="edit-public">{t("publicRepoLabel")}</Label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("publicDisabled")}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-quota">{t("storageQuotaLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-quota"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={t("noLimitPlaceholder")}
                  value={editQuotaValue}
                  onChange={(e) => setEditQuotaOverrides((o) => ({ ...o, value: e.target.value }))}
                  className="flex-1"
                />
                <Select
                  value={editQuotaUnit}
                  onValueChange={(v) => setEditQuotaOverrides((o) => ({ ...o, unit: v as QuotaUnit }))}
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

            {/* Upstream authentication for remote repos (saved separately from main form) */}
            {editRepo?.repo_type === "remote" && (
              <div className="space-y-3 border-t pt-4">
                <Label>{t("upstreamAuthLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("credentialsEditHint")}
                </p>

                {/*
                  #410: Announce the outcome of the upstream-auth save to
                  assistive technology. The save resolves via a parent mutation
                  whose only feedback was a visual toast; this polite live
                  region (role="status") gives screen-reader users the result
                  inside the dialog where their focus already is. The error
                  case uses role="alert" semantics via aria-live="assertive".
                */}
                <div
                  data-testid="upstream-auth-status"
                  role={upstreamAuthStatus.state === "error" ? "alert" : "status"}
                  aria-live={upstreamAuthStatus.state === "error" ? "assertive" : "polite"}
                  className={
                    upstreamAuthStatus.state === "error"
                      ? "text-sm text-destructive"
                      : "text-sm text-emerald-600 dark:text-emerald-500"
                  }
                >
                  {upstreamAuthStatus.state !== "idle" && upstreamAuthStatus.message
                    ? upstreamAuthStatus.message
                    : ""}
                </div>

                {editAuthMode === "view" ? (
                  <div className="space-y-2">
                    {editRepo.upstream_auth_configured ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          {t("authConfigured", {
                            type:
                              editRepo.upstream_auth_type === "basic"
                                ? t("basicAuth")
                                : editRepo.upstream_auth_type === "bearer"
                                  ? t("bearerToken")
                                  : editRepo.upstream_auth_type ?? "",
                          })}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            id="edit-upstream-auth-toggle"
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditAuthMode("edit");
                              setEditAuthType(editRepo.upstream_auth_type ?? "basic");
                            }}
                          >
                            {t("change")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={upstreamAuthPending || removeAuthConfirm}
                            onClick={() => setRemoveAuthConfirm(true)}
                          >
                            {t("remove")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          {t("noAuthConfigured")}
                        </p>
                        <Button
                          id="edit-upstream-auth-toggle"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditAuthMode("edit")}
                        >
                          {t("configure")}
                        </Button>
                      </div>
                    )}
                    {removeAuthConfirm && (
                      <div className="flex items-center gap-2 rounded border border-destructive/50 bg-destructive/5 p-2">
                        <p className="text-xs text-destructive flex-1">
                          {t("removeWarning")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRemoveAuthConfirm(false)}
                        >
                          {t("keep")}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={upstreamAuthPending}
                          onClick={() => {
                            if (onUpstreamAuthUpdate) {
                              onUpstreamAuthUpdate(editRepo.key, { auth_type: "none" });
                            }
                            setRemoveAuthConfirm(false);
                          }}
                        >
                          {t("confirmRemove")}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label htmlFor="edit-upstream-auth-type">{t("authTypeLabel")}</Label>
                    <Select value={editAuthType} onValueChange={setEditAuthType}>
                      <SelectTrigger
                        className="w-full"
                        id="edit-upstream-auth-type"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("authNone")}</SelectItem>
                        <SelectItem value="basic">{t("authBasic")}</SelectItem>
                        <SelectItem value="bearer">{t("authBearer")}</SelectItem>
                      </SelectContent>
                    </Select>

                    {editAuthType === "basic" && (
                      <>
                        <Label htmlFor="edit-upstream-username">{t("usernameLabel")}</Label>
                        <Input
                          id="edit-upstream-username"
                          placeholder={t("usernamePlaceholder")}
                          required
                          value={editAuthUsername}
                          onChange={(e) => setEditAuthUsername(e.target.value)}
                          autoComplete="off"
                        />
                        <Label htmlFor="edit-upstream-password">{t("passwordLabel")}</Label>
                        <Input
                          id="edit-upstream-password"
                          type="password"
                          placeholder={t("passwordPlaceholder")}
                          required
                          value={editAuthPassword}
                          onChange={(e) => setEditAuthPassword(e.target.value)}
                          autoComplete="off"
                        />
                      </>
                    )}

                    {editAuthType === "bearer" && (
                      <>
                        <Label htmlFor="edit-upstream-token">{t("tokenLabel")}</Label>
                        <Input
                          id="edit-upstream-token"
                          type="password"
                          placeholder={t("tokenPlaceholder")}
                          required
                          value={editAuthPassword}
                          onChange={(e) => setEditAuthPassword(e.target.value)}
                          autoComplete="off"
                        />
                      </>
                    )}

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditAuthMode("view");
                          setEditAuthType("none");
                          setEditAuthUsername("");
                          setEditAuthPassword("");
                        }}
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          upstreamAuthPending ||
                          (editAuthType !== "none" && !editAuthPassword) ||
                          (editAuthType === "basic" && !editAuthUsername)
                        }
                        onClick={() => {
                          if (onUpstreamAuthUpdate && editRepo) {
                            const payload: { auth_type: string; username?: string; password?: string } = {
                              auth_type: editAuthType,
                            };
                            if (editAuthType === "basic") {
                              payload.username = editAuthUsername;
                              payload.password = editAuthPassword;
                            } else if (editAuthType === "bearer") {
                              payload.password = editAuthPassword;
                            }
                            onUpstreamAuthUpdate(editRepo.key, payload);
                          }
                        }}
                      >
                        {upstreamAuthPending ? t("saving") : t("saveAuth")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => onEditOpenChange(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={editPending}>
                {editPending ? t("saving") : t("saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Delete Confirm Dialog -- */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={onDeleteOpenChange}
        title={t("deleteTitle")}
        description={t("deleteDescription", { key: deleteRepo?.key ?? "" })}
        typeToConfirm={deleteRepo?.key}
        confirmText={t("deleteConfirmText")}
        danger
        loading={deletePending}
        onConfirm={() => {
          if (deleteRepo) onDeleteConfirm(deleteRepo.key);
        }}
      />
    </>
  );
}
