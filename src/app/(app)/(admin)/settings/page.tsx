"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/admin";
import { settingsApi } from "@/lib/api/settings";
import { ADMIN_SETTINGS_QUERY_KEY, useAdminSettings } from "@/hooks/use-admin-settings";
import { mutationErrorToast } from "@/lib/error-utils";
import { Server, HardDrive, Lock, Info, Mail, Rss, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PageHeader } from "@/components/common/page-header";
import { NpmUpstreamFeedCard } from "@/components/settings/npm-upstream-feed-card";
import type { PasswordPolicy, StorageSettings } from "@/lib/api/settings";

// -- helpers --

function SettingRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Input value={value} disabled className="bg-muted/50" />
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function formatPasswordPolicy(
  policy: PasswordPolicy | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  if (!policy) return t("loading");
  const parts = [t("minChars", { min: policy.min_length })];
  const complexity: string[] = [];
  if (policy.require_uppercase) complexity.push(t("uppercase"));
  if (policy.require_lowercase) complexity.push(t("lowercase"));
  if (policy.require_digit) complexity.push(t("number"));
  if (policy.require_special) complexity.push(t("specialChar"));
  if (complexity.length > 0) {
    parts.push(t("requiresComplexity", { list: complexity.join(", ") }));
  }
  if (policy.history_count > 0) {
    parts.push(t("passwordHistory", { count: policy.history_count }));
  }
  return parts.join("; ");
}

const STORAGE_BACKEND_KEYS: Record<string, string> = {
  filesystem: "storageFilesystem",
  s3: "storageS3",
  gcs: "storageGcs",
  azure: "storageAzure",
};

function formatStorageBackend(
  backend: string,
  t: (key: string) => string
): string {
  return t(STORAGE_BACKEND_KEYS[backend] ?? backend);
}

// -- Upload size limit editor (#189) --

type UploadSizeUnit = "MB" | "GB";

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Convert bytes to a friendly value + unit. 0 means "no limit". */
export function bytesToUploadSize(bytes: number): { value: string; unit: UploadSizeUnit } {
  if (!bytes || bytes <= 0) return { value: "", unit: "MB" };
  if (bytes >= BYTES_PER_GB && bytes % BYTES_PER_GB === 0) {
    return { value: String(bytes / BYTES_PER_GB), unit: "GB" };
  }
  return { value: String(Math.round(bytes / BYTES_PER_MB)), unit: "MB" };
}

/** Convert a value + unit to bytes. Empty/zero/invalid means "no limit" (0). */
export function uploadSizeToBytes(value: string, unit: UploadSizeUnit): number {
  const num = Number(value);
  if (!num || num <= 0 || !Number.isFinite(num)) return 0;
  return Math.round(num * (unit === "GB" ? BYTES_PER_GB : BYTES_PER_MB));
}

function UploadSizeSetting({
  currentBytes,
  loading,
  unavailable,
}: {
  currentBytes: number | undefined;
  loading: boolean;
  unavailable: boolean;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.settings");
  const initial = bytesToUploadSize(currentBytes ?? 0);
  const [value, setValue] = useState(initial.value);
  const [unit, setUnit] = useState<UploadSizeUnit>(initial.unit);
  const [dirty, setDirty] = useState(false);
  // The persisted value arrives asynchronously, so a useState initializer would
  // seed from `undefined` (rendering an empty "No limit") and never refresh once
  // the query resolves. Sync local state during render whenever the persisted
  // bytes change, but only while there are no unsaved edits so we never clobber
  // what the operator is typing. (review fix #464)
  const [seededBytes, setSeededBytes] = useState(currentBytes);
  if (currentBytes !== seededBytes && !dirty) {
    const next = bytesToUploadSize(currentBytes ?? 0);
    setSeededBytes(currentBytes);
    setValue(next.value);
    setUnit(next.unit);
  }

  const saveMutation = useMutation({
    mutationFn: (bytes: number) => settingsApi.updateMaxUploadSize(bytes),
    onSuccess: () => {
      toast.success(t("uploadSizeSaved"));
      queryClient.invalidateQueries({ queryKey: ADMIN_SETTINGS_QUERY_KEY });
      setDirty(false);
    },
    onError: mutationErrorToast(t("uploadSizeSaveFailed")),
  });

  if (loading) {
    return (
      <SettingRow
        label={t("maxUploadSize")}
        value={t("loading")}
        description={t("maxUploadSizeHint")}
      />
    );
  }

  if (unavailable) {
    return (
      <SettingRow
        label={t("maxUploadSize")}
        value={t("unavailable")}
        description={t("maxUploadSizeHint")}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="max-upload-size" className="text-sm">
        {t("maxUploadSize")}
      </Label>
      <div className="flex gap-2">
        <Input
          id="max-upload-size"
          type="number"
          min={0}
          step="any"
          placeholder={t("noLimit")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setDirty(true);
          }}
          className="flex-1"
        />
        <Select
          value={unit}
          onValueChange={(v) => {
            setUnit(v as UploadSizeUnit);
            setDirty(true);
          }}
        >
          <SelectTrigger className="w-20" aria-label={t("unitAria")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MB">MB</SelectItem>
            <SelectItem value="GB">GB</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => saveMutation.mutate(uploadSizeToBytes(value, unit))}
          disabled={saveMutation.isPending || !dirty}
        >
          {saveMutation.isPending && (
            <Loader2 className="size-4 mr-2 animate-spin" />
          )}
          {t("save")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("maxUploadSizeHintLong")}
      </p>
    </div>
  );
}

// -- SMTP settings tab --

function SmtpSettingsTab() {
  const t = useTranslations("admin.settings");
  const [testRecipient, setTestRecipient] = useState("");

  const testMutation = useMutation({
    mutationFn: (recipient: string) => settingsApi.sendTestEmail(recipient),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message || t("testEmailSent"));
      } else {
        toast.error(result.message || t("testEmailFailed"));
      }
    },
    onError: mutationErrorToast(t("testEmailSendFailed")),
  });

  function handleSendTest() {
    if (!testRecipient.trim()) {
      toast.error(t("recipientRequired"));
      return;
    }
    testMutation.mutate(testRecipient.trim());
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("smtpTitle")}</CardTitle>
          <CardDescription>
            {t("smtpDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The backend exposes no SMTP save endpoint — PUT
              /api/v1/admin/smtp does not exist and the old editable form's
              Save button 404'd (issue #555). SMTP is server-side
              configuration only, so this tab is informational. */}
          <Alert>
            <Info className="size-4" />
            <AlertTitle>{t("envConfigured")}</AlertTitle>
            <AlertDescription>
              {t("envConfiguredDescription")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("sendTestEmail")}</CardTitle>
          <CardDescription>
            {t("sendTestEmailDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="test-recipient">{t("recipient")}</Label>
              <Input
                id="test-recipient"
                type="email"
                placeholder={t("recipientPlaceholder")}
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleSendTest}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              {t("sendTestEmail")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// -- page --

export default function SettingsPage() {
  const t = useTranslations("admin.settings");
  const { user } = useAuth();
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => adminApi.getHealth(),
  });

  // One bundled fetch for /api/v1/admin/settings instead of three separate
  // queries (one per slice). The SmtpSettingsTab below shares this same
  // query via the same hook. See #349.
  const {
    data: adminSettings,
    isError: settingsError,
    isLoading: settingsLoading,
  } = useAdminSettings();

  const passwordPolicy = adminSettings?.passwordPolicy;
  const storageSettings = adminSettings?.storageSettings;

  // Render the storage row value, distinguishing loading from error so an
  // API failure doesn't silently fall back to placeholder strings (#334).
  const storageValue = (format: (s: StorageSettings) => string): string => {
    if (settingsLoading) return t("loading");
    if (settingsError || !storageSettings) return t("unavailable");
    return format(storageSettings);
  };

  // Same loading/error/value gating as storageValue, applied to the
  // password-policy row so a backend outage shows "Unavailable" instead
  // of plausible-looking default policy text (#347).
  function passwordPolicyValue(): string {
    if (settingsLoading) return t("loading");
    if (settingsError || !passwordPolicy) return t("unavailable");
    return formatPasswordPolicy(passwordPolicy, t);
  }

  // Deployment environment label, rendered as a badge in the General tab.
  // The backend sources this from its ENVIRONMENT config; older servers omit
  // it, so parseEnvironment yields "" and we fall back to "Unknown" (rather
  // than the previous hardcoded "Production", which was wrong everywhere but
  // prod). Same loading/error gating as the sibling rows.
  const environmentLabel = settingsLoading
    ? t("loading")
    : settingsError || !adminSettings?.environment
      ? t("unknown")
      : adminSettings.environment;

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} />
        <Alert variant="destructive">
          <AlertTitle>{t("accessDenied")}</AlertTitle>
          <AlertDescription>
            {t("accessDeniedDescription")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>{t("readOnlyTitle")}</AlertTitle>
        <AlertDescription>
          {t("readOnlyDescription")}
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Server className="size-4 mr-1.5" />
            {t("tabGeneral")}
          </TabsTrigger>
          <TabsTrigger value="storage">
            <HardDrive className="size-4 mr-1.5" />
            {t("tabStorage")}
          </TabsTrigger>
          <TabsTrigger value="auth">
            <Lock className="size-4 mr-1.5" />
            {t("tabAuth")}
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="size-4 mr-1.5" />
            {t("tabEmail")}
          </TabsTrigger>
          <TabsTrigger value="npm-upstream">
            <Rss className="size-4 mr-1.5" />
            {t("tabNpm")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("generalTitle")}</CardTitle>
              <CardDescription>
                {t("generalDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label={t("apiUrl")}
                value={
                  typeof window !== "undefined"
                    ? process.env.NEXT_PUBLIC_API_URL || window.location.origin
                    : t("loading")
                }
                description={t("apiUrlHint")}
              />
              <Separator />
              <SettingRow
                label={t("serverVersion")}
                value={
                  health?.version
                    ? health.dirty && health.commit
                      ? `${health.version} (${health.commit.slice(0, 7)})`
                      : health.version
                    : "..."
                }
                description={t("serverVersionHint")}
              />
              <Separator />
              <SettingRow
                label={t("webVersion")}
                value={
                  process.env.NEXT_PUBLIC_APP_VERSION?.includes("-") &&
                  process.env.NEXT_PUBLIC_GIT_SHA &&
                  process.env.NEXT_PUBLIC_GIT_SHA !== "unknown"
                    ? `${process.env.NEXT_PUBLIC_APP_VERSION} (${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)})`
                    : process.env.NEXT_PUBLIC_APP_VERSION ?? "..."
                }
                description={t("webVersionHint")}
              />
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm">{t("environment")}</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{environmentLabel}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("storageTitle")}</CardTitle>
              <CardDescription>
                {t("storageDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label={t("storageBackend")}
                value={storageValue((s) => formatStorageBackend(s.storage_backend, t))}
                description={t("storageBackendHint")}
              />
              <Separator />
              <SettingRow
                label={t("storagePath")}
                value={storageValue((s) => s.storage_path)}
                description={t("storagePathHint")}
              />
              <Separator />
              <UploadSizeSetting
                currentBytes={storageSettings?.max_upload_size_bytes}
                loading={settingsLoading}
                unavailable={settingsError || !storageSettings}
              />
              <Separator />
              {/* TODO(#334): swap for storageSettings.deduplication once the backend
                  exposes it on /api/v1/admin/settings. Until then this row is a
                  build-time invariant (always SHA-256 content addressing). */}
              <SettingRow
                label={t("deduplication")}
                value={t("deduplicationValue")}
                description={t("deduplicationHint")}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("authTitle")}</CardTitle>
              <CardDescription>
                {t("authDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label={t("authMethod")}
                value={t("authMethodValue")}
                description={t("authMethodHint")}
              />
              <Separator />
              <SettingRow
                label={t("accessTokenExpiry")}
                value={t("accessTokenExpiryValue")}
                description={t("accessTokenExpiryHint")}
              />
              <Separator />
              <SettingRow
                label={t("refreshTokenExpiry")}
                value={t("refreshTokenExpiryValue")}
                description={t("refreshTokenExpiryHint")}
              />
              <Separator />
              <SettingRow
                label={t("passwordPolicy")}
                value={passwordPolicyValue()}
                description={t("passwordPolicyHint")}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <SmtpSettingsTab />
        </TabsContent>

        <TabsContent value="npm-upstream" className="mt-4">
          <NpmUpstreamFeedCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
