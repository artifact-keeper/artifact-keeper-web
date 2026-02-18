"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  User,
  Key,
  Shield,
  Lock,
  AlertTriangle,
  Info,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "react-qr-code";

import { profileApi } from "@/lib/api/profile";
import { totpApi } from "@/lib/api/totp";
import type { TotpSetupResponse } from "@/lib/api/totp";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";

import { PageHeader } from "@/components/common/page-header";
import { CopyButton } from "@/components/common/copy-button";

// -- Profile Page --

export default function ProfilePage() {
  const { user, refreshUser, changePassword } = useAuth();

  // -- General tab state --
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  // -- Security tab state --
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="size-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                API keys and access tokens have moved to their own page for easier management.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/access-tokens">
                  <ExternalLink className="size-4" />
                  Manage Access Tokens
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -- Access Tokens Tab -- */}
        <TabsContent value="access-tokens" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-5" />
                Access Tokens
              </CardTitle>
              <CardDescription>
                Personal access tokens have moved to their own page for easier management.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/access-tokens">
                  <ExternalLink className="size-4" />
                  Manage Access Tokens
                </Link>
              </Button>
            </CardContent>
          </Card>
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

    </div>
  );
}
