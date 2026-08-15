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
import { useTranslations } from "next-intl";

import { profileApi } from "@/lib/api/profile";
import { totpApi } from "@/lib/api/totp";
import type { TotpSetupResponse } from "@/lib/api/totp";
import { useAuth } from "@/providers/auth-provider";
import {
  toUserMessage,
  isPasswordReuseError,
  PASSWORD_REUSE_MESSAGE,
  mutationErrorToast,
} from "@/lib/error-utils";

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
import { PasswordPolicyHint } from "@/components/common/password-policy-hint";

// -- Profile Page --

export default function ProfilePage() {
  const t = useTranslations("app/protected/profile");
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
      toast.success(t("profileUpdated"));
    },
    onError: mutationErrorToast(t("profileUpdatedError")),
  });

  const [passwordError, setPasswordError] = useState<string | null>(null);

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      toast.success(t("passwordChanged"));
    },
    onError: (err: unknown) => {
      if (isPasswordReuseError(err)) {
        setPasswordError(PASSWORD_REUSE_MESSAGE);
        toast.error(PASSWORD_REUSE_MESSAGE);
      } else {
        const msg = toUserMessage(err, t("passwordChangeError"));
        setPasswordError(null);
        toast.error(msg);
      }
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <User className="size-4" />
            {t("tabGeneral")}
          </TabsTrigger>
          <TabsTrigger value="api-keys">
            <Key className="size-4" />
            {t("tabApiKeys")}
          </TabsTrigger>
          <TabsTrigger value="access-tokens">
            <Shield className="size-4" />
            {t("tabAccessTokens")}
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="size-4" />
            {t("tabSecurity")}
          </TabsTrigger>
        </TabsList>

        {/* -- General Tab -- */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("profileInfoTitle")}</CardTitle>
              <CardDescription>
                {t("profileInfoDescription")}
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
                  <Label htmlFor="username">{t("username")}</Label>
                  <Input
                    id="username"
                    value={user?.username ?? ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("usernameCannotChange")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display-name">{t("displayName")}</Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("displayNamePlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" disabled={profileMutation.isPending}>
                  {profileMutation.isPending ? t("saving") : t("saveChanges")}
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
                {t("tabApiKeys")}
              </CardTitle>
              <CardDescription>
                {t("apiKeysDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/access-tokens">
                  <ExternalLink className="size-4" />
                  {t("manageAccessTokens")}
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
                {t("tabAccessTokens")}
              </CardTitle>
              <CardDescription>
                {t("accessTokensDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/access-tokens">
                  <ExternalLink className="size-4" />
                  {t("manageAccessTokens")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -- Security Tab -- */}
        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("changePasswordTitle")}</CardTitle>
              <CardDescription>
                {t("changePasswordDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newPassword !== confirmPassword) {
                    toast.error(t("passwordsMismatch"));
                    return;
                  }
                  if (newPassword.length < 8) {
                    toast.error(t("passwordTooShort"));
                    return;
                  }
                  passwordMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="current-password">{t("currentPassword")}</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t("currentPasswordPlaceholder")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("newPassword")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    placeholder={t("newPasswordPlaceholder")}
                    required
                    minLength={8}
                    aria-invalid={!!passwordError}
                    aria-describedby={passwordError ? "new-password-error" : undefined}
                  />
                  <PasswordPolicyHint password={newPassword} />
                  {passwordError && (
                    <p id="new-password-error" className="text-sm text-destructive" role="alert">
                      {passwordError}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("confirmPasswordPlaceholder")}
                    required
                  />
                </div>
                <Button type="submit" disabled={passwordMutation.isPending}>
                  {passwordMutation.isPending
                    ? t("changing")
                    : t("changePassword")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-5" />
                {t("twoFaTitle")}
              </CardTitle>
              <CardDescription>
                {t("twoFaDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user?.totp_enabled ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">{t("enabled")}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {t("twoFaActive")}
                    </span>
                  </div>
                  {!showTotpDisable ? (
                    <Button variant="destructive" size="sm" onClick={() => setShowTotpDisable(true)}>
                      {t("disable2fa")}
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
                          toast.success(t("twoFaDisabled"));
                        } catch (err) {
                          setTotpError(toUserMessage(err, t("disable2faError")));
                        } finally {
                          setTotpIsLoading(false);
                        }
                      }}
                    >
                      <p className="text-sm font-medium">{t("confirmDisable2fa")}</p>
                      {totpError && <p className="text-sm text-destructive">{totpError}</p>}
                      <div className="space-y-2">
                        <Label>{t("password")}</Label>
                        <Input
                          type="password"
                          value={totpDisablePassword}
                          onChange={(e) => setTotpDisablePassword(e.target.value)}
                          placeholder={t("passwordPlaceholder")}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("totpCode")}</Label>
                        <Input
                          value={totpDisableCode}
                          onChange={(e) => setTotpDisableCode(e.target.value)}
                          placeholder={t("totpCodePlaceholder")}
                          maxLength={6}
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" variant="destructive" size="sm" disabled={totpIsLoading}>
                          {totpIsLoading ? t("disabling") : t("confirmDisable")}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setShowTotpDisable(false);
                          setTotpError(null);
                        }}>
                          {t("cancel")}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              ) : totpBackupCodes ? (
                <div className="space-y-4">
                  <Alert>
                    <AlertTriangle className="size-4" />
                    <AlertTitle>{t("saveBackupCodes")}</AlertTitle>
                    <AlertDescription>
                      {t("saveBackupCodesDescription")}
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
                      {t("savedCodes")}
                    </Button>
                  </div>
                </div>
              ) : showTotpSetup && totpSetupData ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t("scanQr")}
                  </p>
                  <div className="flex justify-center rounded-lg border bg-white p-4">
                    <QRCode value={totpSetupData.qr_code_url} size={200} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("manualEntryKey")}</Label>
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
                        toast.success(t("twoFaEnabled"));
                      } catch (err) {
                        setTotpError(toUserMessage(err, t("invalidCode")));
                      } finally {
                        setTotpIsLoading(false);
                      }
                    }}
                  >
                    {totpError && <p className="text-sm text-destructive">{totpError}</p>}
                    <div className="space-y-2">
                      <Label>{t("verificationCode")}</Label>
                      <Input
                        value={totpVerifyCode}
                        onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder={t("enterCode")}
                        className="w-48 font-mono text-lg tracking-widest"
                        maxLength={6}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={totpIsLoading || totpVerifyCode.length < 6}>
                        {totpIsLoading ? t("verifying") : t("enable2fa")}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => {
                        setShowTotpSetup(false);
                        setTotpSetupData(null);
                        setTotpVerifyCode("");
                        setTotpError(null);
                      }}>
                        {t("cancel")}
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
                      toast.error(toUserMessage(err, t("setupError")));
                    } finally {
                      setTotpIsLoading(false);
                    }
                  }}
                  disabled={totpIsLoading}
                >
                  {totpIsLoading ? t("settingUp") : t("enableTwoFa")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("sessionsTitle")}</CardTitle>
              <CardDescription>
                {t("sessionsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="size-4" />
                <AlertTitle>{t("activeSessions")}</AlertTitle>
                <AlertDescription>
                  {t("activeSessionsDescription")}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
