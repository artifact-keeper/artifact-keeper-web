"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

function formatPasswordPolicy(policy: PasswordPolicy | undefined): string {
  if (!policy) return "Loading...";
  const parts = [`Minimum ${policy.min_length} characters`];
  const complexity: string[] = [];
  if (policy.require_uppercase) complexity.push("uppercase");
  if (policy.require_lowercase) complexity.push("lowercase");
  if (policy.require_digit) complexity.push("number");
  if (policy.require_special) complexity.push("special character");
  if (complexity.length > 0) {
    parts.push(`requires ${complexity.join(", ")}`);
  }
  if (policy.history_count > 0) {
    parts.push(`${policy.history_count} password history`);
  }
  return parts.join("; ");
}

const STORAGE_BACKEND_LABELS: Record<string, string> = {
  filesystem: "Local Filesystem",
  s3: "S3",
  gcs: "Google Cloud Storage",
  azure: "Azure Blob Storage",
};

function formatStorageBackend(backend: string): string {
  return STORAGE_BACKEND_LABELS[backend] ?? backend;
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
      toast.success("Upload size limit saved");
      queryClient.invalidateQueries({ queryKey: ADMIN_SETTINGS_QUERY_KEY });
      setDirty(false);
    },
    onError: mutationErrorToast("Failed to save upload size limit"),
  });

  if (loading) {
    return (
      <SettingRow
        label="Max Upload Size"
        value="Loading..."
        description="Maximum allowed size for a single artifact upload."
      />
    );
  }

  if (unavailable) {
    return (
      <SettingRow
        label="Max Upload Size"
        value="Unavailable"
        description="Maximum allowed size for a single artifact upload."
      />
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="max-upload-size" className="text-sm">
        Max Upload Size
      </Label>
      <div className="flex gap-2">
        <Input
          id="max-upload-size"
          type="number"
          min={0}
          step="any"
          placeholder="No limit"
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
          <SelectTrigger className="w-20" aria-label="Upload size unit">
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
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Maximum allowed size for a single artifact upload. Leave empty for no
        limit. Applies to every repository.
      </p>
    </div>
  );
}

// -- SMTP settings tab --

function SmtpSettingsTab() {
  const [testRecipient, setTestRecipient] = useState("");

  const testMutation = useMutation({
    mutationFn: (recipient: string) => settingsApi.sendTestEmail(recipient),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message || "Test email sent successfully");
      } else {
        toast.error(result.message || "Test email failed");
      }
    },
    onError: mutationErrorToast("Failed to send test email"),
  });

  function handleSendTest() {
    if (!testRecipient.trim()) {
      toast.error("Please enter a recipient email address");
      return;
    }
    testMutation.mutate(testRecipient.trim());
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMTP Configuration</CardTitle>
          <CardDescription>
            Outbound email server used for notifications, password resets, and
            other system emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* The backend exposes no SMTP save endpoint — PUT
              /api/v1/admin/smtp does not exist and the old editable form's
              Save button 404'd (issue #555). SMTP is server-side
              configuration only, so this tab is informational. */}
          <Alert>
            <Info className="size-4" />
            <AlertTitle>Configured via environment variables</AlertTitle>
            <AlertDescription>
              SMTP is configured on the server with the SMTP_HOST, SMTP_PORT,
              SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_ADDRESS, and
              SMTP_TLS_MODE environment variables; changes take effect on
              server restart. When SMTP_HOST is not set, email delivery is
              disabled.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send Test Email</CardTitle>
          <CardDescription>
            Verify the server-side SMTP configuration by sending a test
            message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="test-recipient">Recipient</Label>
              <Input
                id="test-recipient"
                type="email"
                placeholder="admin@example.com"
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
              Send Test Email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// -- page --

export default function SettingsPage() {
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
    if (settingsLoading) return "Loading...";
    if (settingsError || !storageSettings) return "Unavailable";
    return format(storageSettings);
  };

  // Same loading/error/value gating as storageValue, applied to the
  // password-policy row so a backend outage shows "Unavailable" instead
  // of plausible-looking default policy text (#347).
  function passwordPolicyValue(): string {
    if (settingsLoading) return "Loading...";
    if (settingsError || !passwordPolicy) return "Unavailable";
    return formatPasswordPolicy(passwordPolicy);
  }

  // Deployment environment label, rendered as a badge in the General tab.
  // The backend sources this from its ENVIRONMENT config; older servers omit
  // it, so parseEnvironment yields "" and we fall back to "Unknown" (rather
  // than the previous hardcoded "Production", which was wrong everywhere but
  // prod). Same loading/error gating as the sibling rows.
  const environmentLabel = settingsLoading
    ? "Loading..."
    : settingsError || !adminSettings?.environment
      ? "Unknown"
      : adminSettings.environment;

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an administrator to view settings.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="System configuration overview. Settings are configured via environment variables and shown read-only."
      />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>Read-only Configuration</AlertTitle>
        <AlertDescription>
          Server settings are configured via environment variables. The values
          shown below reflect the current runtime configuration.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Server className="size-4 mr-1.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="storage">
            <HardDrive className="size-4 mr-1.5" />
            Storage
          </TabsTrigger>
          <TabsTrigger value="auth">
            <Lock className="size-4 mr-1.5" />
            Authentication
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="size-4 mr-1.5" />
            Email
          </TabsTrigger>
          <TabsTrigger value="npm-upstream">
            <Rss className="size-4 mr-1.5" />
            npm Upstream
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General Settings</CardTitle>
              <CardDescription>
                Core server configuration and version information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="API URL"
                value={
                  typeof window !== "undefined"
                    ? process.env.NEXT_PUBLIC_API_URL || window.location.origin
                    : "Loading..."
                }
                description="The base URL used by the frontend to reach the API server."
              />
              <Separator />
              <SettingRow
                label="Server Version"
                value={
                  health?.version
                    ? health.dirty && health.commit
                      ? `${health.version} (${health.commit.slice(0, 7)})`
                      : health.version
                    : "..."
                }
                description="Current Artifact Keeper server version."
              />
              <Separator />
              <SettingRow
                label="Web Version"
                value={
                  process.env.NEXT_PUBLIC_APP_VERSION?.includes("-") &&
                  process.env.NEXT_PUBLIC_GIT_SHA &&
                  process.env.NEXT_PUBLIC_GIT_SHA !== "unknown"
                    ? `${process.env.NEXT_PUBLIC_APP_VERSION} (${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)})`
                    : process.env.NEXT_PUBLIC_APP_VERSION ?? "..."
                }
                description="Current web frontend version."
              />
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm">Environment</Label>
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
              <CardTitle className="text-base">Storage Settings</CardTitle>
              <CardDescription>
                Artifact storage backend and path configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="Storage Backend"
                value={storageValue((s) => formatStorageBackend(s.storage_backend))}
                description="The type of storage backend used for artifact data."
              />
              <Separator />
              <SettingRow
                label="Storage Path"
                value={storageValue((s) => s.storage_path)}
                description="The filesystem path where artifact files are stored (when storage backend is local)."
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
                label="Deduplication"
                value="Enabled (SHA-256)"
                description="Content-addressable storage to avoid storing duplicate artifacts."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Authentication Settings</CardTitle>
              <CardDescription>
                Token and session configuration for user authentication.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                label="Authentication Method"
                value="JWT (JSON Web Token)"
                description="The method used to authenticate API requests."
              />
              <Separator />
              <SettingRow
                label="Access Token Expiry"
                value="1 hour"
                description="How long an access token remains valid before requiring refresh."
              />
              <Separator />
              <SettingRow
                label="Refresh Token Expiry"
                value="7 days"
                description="How long a refresh token remains valid."
              />
              <Separator />
              <SettingRow
                label="Password Policy"
                value={passwordPolicyValue()}
                description="Minimum password requirements for user accounts."
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
