"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User,
  Key,
  Shield,
  Lock,
  Plus,
  Trash2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";

import { profileApi } from "@/lib/api/profile";
import { totpApi } from "@/lib/api/totp";
import type { TotpSetupResponse } from "@/lib/api/totp";
import type {
  ApiKey,
  AccessToken,
  CreateApiKeyRequest,
  CreateAccessTokenRequest,
  CreateApiKeyResponse,
  CreateAccessTokenResponse,
} from "@/lib/api/profile";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { CopyButton } from "@/components/common/copy-button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";

// -- constants --

const SCOPES = [
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "delete", label: "Delete" },
  { value: "admin", label: "Admin" },
];

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "0", label: "Never" },
];

// -- Profile Page --

export default function ProfilePage() {
  const { user, refreshUser, changePassword } = useAuth();
  const queryClient = useQueryClient();
  const availableScopes = SCOPES.filter((s) => s.value !== "admin" || user?.is_admin);

  // -- General tab state --
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  // -- Security tab state --
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // -- API Key creation --
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyExpiry, setKeyExpiry] = useState("90");
  const [keyScopes, setKeyScopes] = useState<string[]>(["read"]);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  // -- Access Token creation --
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("90");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read"]);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);

  // -- TOTP 2FA state --
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<TotpSetupResponse | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState("");
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[] | null>(null);
  const [totpIsLoading, setTotpIsLoading] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [showTotpDisable, setShowTotpDisable] = useState(false);
  const [totpDisablePassword, setTotpDisablePassword] = useState("");
  const [totpDisableCode, setTotpDisableCode] = useState("");

  // -- Revoke confirm --
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);

  // -- Queries --
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["profile", "api-keys"],
    queryFn: () => profileApi.listApiKeys(),
  });

  const { data: accessTokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ["profile", "access-tokens"],
    queryFn: () => profileApi.listAccessTokens(),
  });

  // -- Mutations --
  const profileMutation = useMutation({
    mutationFn: (data: { display_name?: string; email?: string }) =>
      profileApi.update(data),
    onSuccess: () => {
      refreshUser();
      toast.success("Profile updated successfully");
    },
    onError: () => toast.error("Failed to update profile"),
  });

  const createKeyMutation = useMutation({
    mutationFn: (data: CreateApiKeyRequest) => profileApi.createApiKey(data),
    onSuccess: (result: CreateApiKeyResponse) => {
      queryClient.invalidateQueries({ queryKey: ["profile", "api-keys"] });
      setNewlyCreatedKey(result.key);
      setKeyName("");
      setKeyScopes(["read"]);
      setKeyExpiry("90");
      toast.success("API key created");
    },
    onError: () => toast.error("Failed to create API key"),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => profileApi.deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "api-keys"] });
      setRevokeKeyId(null);
      toast.success("API key revoked");
    },
    onError: () => toast.error("Failed to revoke API key"),
  });

  const createTokenMutation = useMutation({
    mutationFn: (data: CreateAccessTokenRequest) =>
      profileApi.createAccessToken(data),
    onSuccess: (result: CreateAccessTokenResponse) => {
      queryClient.invalidateQueries({
        queryKey: ["profile", "access-tokens"],
      });
      setNewlyCreatedToken(result.token);
      setTokenName("");
      setTokenScopes(["read"]);
      setTokenExpiry("90");
      toast.success("Access token created");
    },
    onError: () => toast.error("Failed to create access token"),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (id: string) => profileApi.deleteAccessToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["profile", "access-tokens"],
      });
      setRevokeTokenId(null);
      toast.success("Access token revoked");
    },
    onError: () => toast.error("Failed to revoke access token"),
  });

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully");
    },
    onError: () =>
      toast.error("Failed to change password. Check your current password."),
  });

  // -- Helpers --
  const toggleScope = (scopes: string[], setScopes: (s: string[]) => void, scope: string) => {
    setScopes(
      scopes.includes(scope)
        ? scopes.filter((s) => s !== scope)
        : [...scopes, scope]
    );
  };

  // -- API Key columns --
  const keyColumns: DataTableColumn<ApiKey>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (k) => k.name,
      sortable: true,
      cell: (k) => (
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{k.name}</span>
        </div>
      ),
    },
    {
      id: "prefix",
      header: "Key Prefix",
      cell: (k) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {k.key_prefix}...
        </code>
      ),
    },
    {
      id: "scopes",
      header: "Scopes",
      cell: (k) => (
        <div className="flex flex-wrap gap-1">
          {(k.scopes ?? []).map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "expires",
      header: "Expires",
      accessor: (k) => k.expires_at ?? "",
      cell: (k) =>
        k.expires_at ? (
          <span className="text-sm text-muted-foreground">
            {new Date(k.expires_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Never</span>
        ),
    },
    {
      id: "created",
      header: "Created",
      accessor: (k) => k.created_at,
      sortable: true,
      cell: (k) => (
        <span className="text-sm text-muted-foreground">
          {new Date(k.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (k) => (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevokeKeyId(k.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Revoke</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // -- Access Token columns --
  const tokenColumns: DataTableColumn<AccessToken>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (t) => t.name,
      sortable: true,
      cell: (t) => (
        <div className="flex items-center gap-2">
          <Shield className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{t.name}</span>
        </div>
      ),
    },
    {
      id: "prefix",
      header: "Token Prefix",
      cell: (t) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {t.token_prefix}...
        </code>
      ),
    },
    {
      id: "scopes",
      header: "Scopes",
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          {(t.scopes ?? []).map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "expires",
      header: "Expires",
      accessor: (t) => t.expires_at ?? "",
      cell: (t) =>
        t.expires_at ? (
          <span className="text-sm text-muted-foreground">
            {new Date(t.expires_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Never</span>
        ),
    },
    {
      id: "created",
      header: "Created",
      accessor: (t) => t.created_at,
      sortable: true,
      cell: (t) => (
        <span className="text-sm text-muted-foreground">
          {new Date(t.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (t) => (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevokeTokenId(t.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Revoke</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Manage your account settings, API keys, and security preferences."
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <User className="size-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="api-keys">
            <Key className="size-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="access-tokens">
            <Shield className="size-4" />
            Access Tokens
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="size-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* -- General Tab -- */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your display name and email address.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  profileMutation.mutate({
                    display_name: displayName,
                    email,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={user?.username ?? ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Username cannot be changed.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display-name">Display Name</Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" disabled={profileMutation.isPending}>
                  {profileMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -- API Keys Tab -- */}
        <TabsContent value="api-keys" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">API Keys</h2>
              <p className="text-sm text-muted-foreground">
                Manage API keys for programmatic access.
              </p>
            </div>
            <Button onClick={() => setCreateKeyOpen(true)}>
              <Plus className="size-4" />
              Create API Key
            </Button>
          </div>

          {apiKeys.length === 0 && !keysLoading ? (
            <EmptyState
              icon={Key}
              title="No API keys"
              description="Create an API key for programmatic access to the registry."
              action={
                <Button onClick={() => setCreateKeyOpen(true)}>
                  <Plus className="size-4" />
                  Create API Key
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={keyColumns}
              data={apiKeys}
              loading={keysLoading}
              rowKey={(k) => k.id}
              emptyMessage="No API keys found."
            />
          )}
        </TabsContent>

        {/* -- Access Tokens Tab -- */}
        <TabsContent value="access-tokens" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Access Tokens</h2>
              <p className="text-sm text-muted-foreground">
                Manage personal access tokens for authentication.
              </p>
            </div>
            <Button onClick={() => setCreateTokenOpen(true)}>
              <Plus className="size-4" />
              Create Token
            </Button>
          </div>

          {accessTokens.length === 0 && !tokensLoading ? (
            <EmptyState
              icon={Shield}
              title="No access tokens"
              description="Create a personal access token for CLI or CI/CD authentication."
              action={
                <Button onClick={() => setCreateTokenOpen(true)}>
                  <Plus className="size-4" />
                  Create Token
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={tokenColumns}
              data={accessTokens}
              loading={tokensLoading}
              rowKey={(t) => t.id}
              emptyMessage="No access tokens found."
            />
          )}
        </TabsContent>

        {/* -- Security Tab -- */}
        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your password. Must be at least 8 characters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-6">
                <Info className="size-4" />
                <AlertTitle>Password requirements</AlertTitle>
                <AlertDescription>
                  Your password must be at least 8 characters long. We recommend
                  using a combination of letters, numbers, and special
                  characters.
                </AlertDescription>
              </Alert>
              <form
                className="space-y-4 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newPassword !== confirmPassword) {
                    toast.error("Passwords do not match");
                    return;
                  }
                  if (newPassword.length < 8) {
                    toast.error("Password must be at least 8 characters");
                    return;
                  }
                  passwordMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                  />
                </div>
                <Button type="submit" disabled={passwordMutation.isPending}>
                  {passwordMutation.isPending
                    ? "Changing..."
                    : "Change Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-5" />
                Two-Factor Authentication
              </CardTitle>
              <CardDescription>
                Add an extra layer of security with a TOTP authenticator app.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user?.totp_enabled ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">Enabled</Badge>
                    <span className="text-sm text-muted-foreground">
                      Two-factor authentication is active
                    </span>
                  </div>
                  {!showTotpDisable ? (
                    <Button variant="destructive" size="sm" onClick={() => setShowTotpDisable(true)}>
                      Disable 2FA
                    </Button>
                  ) : (
                    <form
                      className="space-y-3 rounded-lg border p-4"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setTotpIsLoading(true);
                        setTotpError(null);
                        try {
                          await totpApi.disable(totpDisablePassword, totpDisableCode);
                          await refreshUser();
                          setShowTotpDisable(false);
                          setTotpDisablePassword("");
                          setTotpDisableCode("");
                          toast.success("Two-factor authentication disabled");
                        } catch (err) {
                          setTotpError(err instanceof Error ? err.message : "Failed to disable 2FA");
                        } finally {
                          setTotpIsLoading(false);
                        }
                      }}
                    >
                      <p className="text-sm font-medium">Confirm disable 2FA</p>
                      {totpError && <p className="text-sm text-destructive">{totpError}</p>}
                      <div className="space-y-2">
                        <Label>Password</Label>
                        <Input
                          type="password"
                          value={totpDisablePassword}
                          onChange={(e) => setTotpDisablePassword(e.target.value)}
                          placeholder="Your password"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>TOTP Code</Label>
                        <Input
                          value={totpDisableCode}
                          onChange={(e) => setTotpDisableCode(e.target.value)}
                          placeholder="6-digit code"
                          maxLength={6}
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" variant="destructive" size="sm" disabled={totpIsLoading}>
                          {totpIsLoading ? "Disabling..." : "Confirm Disable"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setShowTotpDisable(false);
                          setTotpError(null);
                        }}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              ) : totpBackupCodes ? (
                <div className="space-y-4">
                  <Alert>
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Save your backup codes</AlertTitle>
                    <AlertDescription>
                      Store these codes in a safe place. Each can be used once if you lose access to your authenticator app.
                    </AlertDescription>
                  </Alert>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted p-4">
                    {totpBackupCodes.map((code, i) => (
                      <code key={i} className="text-sm font-mono">{code}</code>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <CopyButton value={totpBackupCodes.join("\n")} />
                    <Button onClick={() => {
                      setTotpBackupCodes(null);
                      setShowTotpSetup(false);
                      setTotpSetupData(null);
                      setTotpVerifyCode("");
                    }}>
                      I&apos;ve saved these codes
                    </Button>
                  </div>
                </div>
              ) : showTotpSetup && totpSetupData ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                  <div className="flex justify-center rounded-lg border bg-white p-4">
                    <QRCode value={totpSetupData.qr_code_url} size={200} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Manual entry key</Label>
                    <div className="flex items-center gap-2 rounded border bg-muted px-3 py-2">
                      <code className="flex-1 break-all text-xs">{totpSetupData.secret}</code>
                      <CopyButton value={totpSetupData.secret} />
                    </div>
                  </div>
                  <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setTotpIsLoading(true);
                      setTotpError(null);
                      try {
                        const result = await totpApi.enable(totpVerifyCode);
                        setTotpBackupCodes(result.backup_codes);
                        await refreshUser();
                        toast.success("Two-factor authentication enabled");
                      } catch (err) {
                        setTotpError(err instanceof Error ? err.message : "Invalid code");
                      } finally {
                        setTotpIsLoading(false);
                      }
                    }}
                  >
                    {totpError && <p className="text-sm text-destructive">{totpError}</p>}
                    <div className="space-y-2">
                      <Label>Verification Code</Label>
                      <Input
                        value={totpVerifyCode}
                        onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Enter 6-digit code"
                        className="w-48 font-mono text-lg tracking-widest"
                        maxLength={6}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={totpIsLoading || totpVerifyCode.length < 6}>
                        {totpIsLoading ? "Verifying..." : "Enable 2FA"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => {
                        setShowTotpSetup(false);
                        setTotpSetupData(null);
                        setTotpVerifyCode("");
                        setTotpError(null);
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <Button
                  onClick={async () => {
                    setTotpIsLoading(true);
                    try {
                      const data = await totpApi.setup();
                      setTotpSetupData(data);
                      setShowTotpSetup(true);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to start 2FA setup");
                    } finally {
                      setTotpIsLoading(false);
                    }
                  }}
                  disabled={totpIsLoading}
                >
                  {totpIsLoading ? "Setting up..." : "Enable Two-Factor Authentication"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
              <CardDescription>
                Manage your active sessions across devices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="size-4" />
                <AlertTitle>Active sessions</AlertTitle>
                <AlertDescription>
                  You are currently logged in from this device. Session
                  management will be available in a future update.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* -- Create API Key Dialog -- */}
      <Dialog
        open={createKeyOpen}
        onOpenChange={(o) => {
          setCreateKeyOpen(o);
          if (!o) {
            setKeyName("");
            setKeyScopes(["read"]);
            setKeyExpiry("90");
            setNewlyCreatedKey(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {newlyCreatedKey ? (
            <>
              <DialogHeader>
                <DialogTitle>API Key Created</DialogTitle>
                <DialogDescription>
                  Copy your API key now. You will not be able to see it again.
                </DialogDescription>
              </DialogHeader>
              <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                <AlertTriangle className="size-4" />
                <AlertTitle>Store it safely</AlertTitle>
                <AlertDescription>
                  This key will only be shown once. Store it in a secure
                  location.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
                <code className="flex-1 break-all text-sm">
                  {newlyCreatedKey}
                </code>
                <CopyButton value={newlyCreatedKey} />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setCreateKeyOpen(false);
                    setNewlyCreatedKey(null);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Generate a new API key for programmatic access.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createKeyMutation.mutate({
                    name: keyName,
                    expires_in_days:
                      keyExpiry === "0" ? undefined : Number(keyExpiry),
                    scopes: keyScopes,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="key-name">Name</Label>
                  <Input
                    id="key-name"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g., CI/CD Pipeline"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiration</Label>
                  <Select value={keyExpiry} onValueChange={setKeyExpiry}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label>Scopes</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {availableScopes.map((s) => (
                      <label
                        key={s.value}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={keyScopes.includes(s.value)}
                          onCheckedChange={() =>
                            toggleScope(keyScopes, setKeyScopes, s.value)
                          }
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setCreateKeyOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createKeyMutation.isPending || !keyName}
                  >
                    {createKeyMutation.isPending ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* -- Create Access Token Dialog -- */}
      <Dialog
        open={createTokenOpen}
        onOpenChange={(o) => {
          setCreateTokenOpen(o);
          if (!o) {
            setTokenName("");
            setTokenScopes(["read"]);
            setTokenExpiry("90");
            setNewlyCreatedToken(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {newlyCreatedToken ? (
            <>
              <DialogHeader>
                <DialogTitle>Access Token Created</DialogTitle>
                <DialogDescription>
                  Copy your access token now. You will not be able to see it
                  again.
                </DialogDescription>
              </DialogHeader>
              <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                <AlertTriangle className="size-4" />
                <AlertTitle>Store it safely</AlertTitle>
                <AlertDescription>
                  This token will only be shown once. Store it in a secure
                  location.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
                <code className="flex-1 break-all text-sm">
                  {newlyCreatedToken}
                </code>
                <CopyButton value={newlyCreatedToken} />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setCreateTokenOpen(false);
                    setNewlyCreatedToken(null);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create Access Token</DialogTitle>
                <DialogDescription>
                  Generate a personal access token for CLI or CI/CD
                  authentication.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createTokenMutation.mutate({
                    name: tokenName,
                    expires_in_days:
                      tokenExpiry === "0" ? undefined : Number(tokenExpiry),
                    scopes: tokenScopes,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="token-name">Name</Label>
                  <Input
                    id="token-name"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="e.g., Local Development"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiration</Label>
                  <Select value={tokenExpiry} onValueChange={setTokenExpiry}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label>Scopes</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {availableScopes.map((s) => (
                      <label
                        key={s.value}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={tokenScopes.includes(s.value)}
                          onCheckedChange={() =>
                            toggleScope(tokenScopes, setTokenScopes, s.value)
                          }
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setCreateTokenOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createTokenMutation.isPending || !tokenName}
                  >
                    {createTokenMutation.isPending
                      ? "Creating..."
                      : "Create Token"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* -- Revoke API Key Confirm -- */}
      <ConfirmDialog
        open={!!revokeKeyId}
        onOpenChange={(o) => {
          if (!o) setRevokeKeyId(null);
        }}
        title="Revoke API Key"
        description="This will permanently invalidate this API key. Any applications using it will lose access immediately."
        confirmText="Revoke Key"
        danger
        loading={revokeKeyMutation.isPending}
        onConfirm={() => {
          if (revokeKeyId) revokeKeyMutation.mutate(revokeKeyId);
        }}
      />

      {/* -- Revoke Access Token Confirm -- */}
      <ConfirmDialog
        open={!!revokeTokenId}
        onOpenChange={(o) => {
          if (!o) setRevokeTokenId(null);
        }}
        title="Revoke Access Token"
        description="This will permanently invalidate this access token. Any sessions using it will be terminated."
        confirmText="Revoke Token"
        danger
        loading={revokeTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenId) revokeTokenMutation.mutate(revokeTokenId);
        }}
      />
    </div>
  );
}
