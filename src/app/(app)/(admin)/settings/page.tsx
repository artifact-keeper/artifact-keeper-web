"use client";

import { useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/admin";
import { settingsApi } from "@/lib/api/settings";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import { Server, HardDrive, Lock, Info, Mail, Loader2 } from "lucide-react";

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
import type { PasswordPolicy, SmtpConfig, SmtpTlsMode, StorageSettings } from "@/lib/api/settings";

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

// -- SMTP settings tab --

function SmtpSettingsTab() {
  // Reads from the shared `admin-settings` cache populated by SettingsPage's
  // top-level useQuery — same queryKey + same queryFn so react-query dedups
  // to a single HTTP round trip (#349). The sub-component pulls the SMTP
  // slice off the bundle.
  const { data: settings, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => settingsApi.getAllSettings(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const smtpConfig = settings?.smtpConfig;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !smtpConfig) {
    // `!smtpConfig` is logically dead once isLoading and isError are
    // handled (the success path always returns an object), but stating
    // it makes the invariant load-bearing for the type narrowing below
    // and for any future maintainer reading the render flow (R3, #347).
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="destructive">
            <AlertTitle>SMTP configuration unavailable</AlertTitle>
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "Unable to load SMTP configuration from the server."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Remount the form when query data changes so initial state resets
  // without needing setState inside an effect.
  return <SmtpSettingsForm key={dataUpdatedAt} initialConfig={smtpConfig} />;
}

function SmtpSettingsForm({
  initialConfig,
}: {
  initialConfig: SmtpConfig | undefined;
}) {
  const queryClient = useQueryClient();

  const [host, setHost] = useState(initialConfig?.host ?? "");
  const [port, setPort] = useState(String(initialConfig?.port ?? 587));
  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState("");
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [fromAddress, setFromAddress] = useState(
    initialConfig?.from_address ?? ""
  );
  const [tlsMode, setTlsMode] = useState<SmtpTlsMode>(
    initialConfig?.tls_mode ?? "starttls"
  );
  const [testRecipient, setTestRecipient] = useState("");
  const [formDirty, setFormDirty] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (config: SmtpConfig) => settingsApi.updateSmtpConfig(config),
    onSuccess: () => {
      toast.success("SMTP configuration saved");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      setFormDirty(false);
    },
    onError: mutationErrorToast("Failed to save SMTP configuration"),
  });

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

  function handleFieldChange<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setFormDirty(true);
    };
  }

  function handleSave() {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast.error("Port must be a number between 1 and 65535");
      return;
    }
    if (!host.trim()) {
      toast.error("SMTP host is required");
      return;
    }
    if (!fromAddress.trim()) {
      toast.error("From address is required");
      return;
    }
    const payload: Record<string, unknown> = {
      host: host.trim(),
      port: portNum,
      username: username.trim(),
      from_address: fromAddress.trim(),
      tls_mode: tlsMode,
    };
    if (passwordDirty) {
      payload.password = password;
    }
    saveMutation.mutate(payload as unknown as SmtpConfig);
  }

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
            Configure the outbound email server used for notifications, password
            resets, and other system emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-host">Host</Label>
              <Input
                id="smtp-host"
                placeholder="smtp.example.com"
                value={host}
                onChange={(e) => handleFieldChange(setHost)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Hostname or IP address of the SMTP server.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                placeholder="587"
                value={port}
                onChange={(e) => handleFieldChange(setPort)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Common ports: 25 (SMTP), 465 (SMTPS), 587 (Submission).
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-username">Username</Label>
              <Input
                id="smtp-username"
                placeholder="user@example.com"
                autoComplete="off"
                value={username}
                onChange={(e) => handleFieldChange(setUsername)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank if the server does not require authentication.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-password">Password</Label>
              <Input
                id="smtp-password"
                type="password"
                placeholder="********"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordDirty(true);
                  setFormDirty(true);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Stored encrypted on the server. Leave blank to keep the existing value.
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-from">From Address</Label>
              <Input
                id="smtp-from"
                type="email"
                placeholder="noreply@example.com"
                value={fromAddress}
                onChange={(e) => handleFieldChange(setFromAddress)(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The sender address used in outgoing emails.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-tls">TLS Mode</Label>
              <Select
                value={tlsMode}
                onValueChange={(v) => handleFieldChange(setTlsMode)(v as SmtpTlsMode)}
              >
                <SelectTrigger id="smtp-tls">
                  <SelectValue placeholder="Select TLS mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="starttls">STARTTLS</SelectItem>
                  <SelectItem value="tls">TLS</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                STARTTLS upgrades an unencrypted connection. TLS connects with encryption from the start.
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !formDirty}
            >
              {saveMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              Save SMTP Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send Test Email</CardTitle>
          <CardDescription>
            Verify the SMTP configuration by sending a test message. Save any
            pending changes before testing.
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

  // One useQuery for /api/v1/admin/settings instead of three separate
  // queries (one per slice). Each tab derives its data from the shared
  // bundle. See #349.
  const {
    data: adminSettings,
    isError: settingsError,
    isLoading: settingsLoading,
  } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => settingsApi.getAllSettings(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

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
                  <Badge variant="secondary">Production</Badge>
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
              <SettingRow
                label="Max Upload Size"
                value={storageValue((s) => formatBytes(s.max_upload_size_bytes))}
                description="Maximum allowed size for a single artifact upload."
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
      </Tabs>
    </div>
  );
}
