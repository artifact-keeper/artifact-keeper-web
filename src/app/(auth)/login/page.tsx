"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Loader2, Lock, LogIn, Shield, Terminal } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { toUserMessage, isAccountLocked } from "@/lib/error-utils";
import { ssoApi } from "@/lib/api/sso";
import type { SsoProvider } from "@/types/sso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

type SelectedProvider =
  | { type: "local" }
  | { type: "ldap"; id: string; name: string };

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, refreshUser, setupRequired, totpRequired, verifyTotp, clearTotpRequired } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [accountLocked, setAccountLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<SelectedProvider>({
    type: "local",
  });

  useEffect(() => {
    ssoApi
      .listProviders()
      .then(setSsoProviders)
      .catch(() => {
        // Swallow the error: an unreachable SSO endpoint shouldn't block local
        // login. providersLoaded still flips so the form can render its
        // fail-safe state (showing the local form).
      })
      .finally(() => setProvidersLoaded(true));
  }, []);

  const ldapProviders = useMemo(
    () => ssoProviders.filter((p) => p.provider_type === "ldap"),
    [ssoProviders]
  );

  const redirectProviders = useMemo(
    () =>
      ssoProviders.filter(
        (p) => p.provider_type === "oidc" || p.provider_type === "saml"
      ),
    [ssoProviders]
  );

  // The local username/password form is consumed by either local password
  // login (the built-in admin account / "admin bypass") or LDAP. When the
  // admin has configured an SSO provider that is button-driven (OIDC/SAML)
  // and no LDAP provider exists, showing the form is misleading because the
  // fields don't go anywhere — see issue #350. We still surface the form
  // during first-time setup so an admin can complete the initial password
  // change with the bootstrap admin account.
  //
  // STOPGAP: this is a heuristic. The "admin bypass" toggle is a backend-side
  // setting with no public flag in the SDK, so we infer from the SSO providers
  // list (no LDAP + redirect providers exist => password fields have no
  // consumer). If admin bypass is enabled, an operator can recover via
  // `?fallback=local` to force the form open. Tracked to make precise once
  // the backend exposes a public `local_auth_enabled` flag.
  const forceLocalFallback = searchParams?.get("fallback") === "local";
  const showLocalForm =
    forceLocalFallback ||
    setupRequired ||
    ldapProviders.length > 0 ||
    redirectProviders.length === 0;

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginValues) {
    setIsLoading(true);
    setError(null);
    setAccountLocked(false);
    try {
      if (selectedProvider.type === "ldap") {
        // Tokens are set as httpOnly cookies by the backend
        await ssoApi.ldapLogin(
          selectedProvider.id,
          values.username,
          values.password
        );
        await refreshUser();
        router.push("/");
      } else {
        const result = await login(
          values.username,
          values.password
        );
        if (result === "totp") {
          // Component will re-render with TOTP form
        } else if (result) {
          router.push("/change-password");
        } else {
          router.push("/");
        }
      }
    } catch (err) {
      // accountLocked and error were both reset above; only set the branch we hit.
      if (isAccountLocked(err)) {
        setAccountLocked(true);
      } else {
        setError(toUserMessage(err, "Login failed. Please check your credentials."));
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function onTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await verifyTotp(totpCode);
      router.push("/");
    } catch (err) {
      setError(toUserMessage(err, "Invalid TOTP code"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {setupRequired && (
        <Alert className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <Terminal className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">First-Time Setup</AlertTitle>
          <AlertDescription>
            <p>A random admin password was generated. Retrieve it from the server:</p>
            <code className="mt-1.5 block rounded bg-amber-100 px-2 py-1.5 font-mono text-xs break-all dark:bg-amber-950/50">
              docker exec artifact-keeper-backend cat /data/storage/admin.password
            </code>
            <p className="mt-1.5">
              Log in with username <strong>admin</strong> and the password from the file.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {totpRequired ? (
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Shield className="size-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Two-Factor Authentication</CardTitle>
            <CardDescription>Enter the 6-digit code from your authenticator app</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <form onSubmit={onTotpSubmit} className="space-y-4">
              <div className="flex justify-center">
                <Input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-48 text-center font-mono text-2xl tracking-widest"
                  autoFocus
                  maxLength={6}
                  disabled={isLoading}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                You can also use a backup code
              </p>
              <Button type="submit" className="w-full" size="lg" disabled={isLoading || totpCode.length < 6}>
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  clearTotpRequired();
                  setTotpCode("");
                  setError(null);
                }}
              >
                Back to login
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center">
            <Image
              src="/logo-48.png"
              alt="Artifact Keeper"
              width={48}
              height={48}
            />
          </div>
          <CardTitle className="text-xl">Artifact Keeper</CardTitle>
          <CardDescription>{setupRequired ? "Complete first-time setup" : "Sign in to your account"}</CardDescription>
        </CardHeader>
        <CardContent>
          {accountLocked && (
            <Alert className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <Lock className="size-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">Account Locked</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                Your account has been temporarily locked due to too many failed
                login attempts. Please wait a few minutes and try again, or
                contact an administrator to unlock your account.
              </AlertDescription>
            </Alert>
          )}
          {error && !accountLocked && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {ldapProviders.length > 0 && (
            <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedProvider.type === "local"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSelectedProvider({ type: "local" })}
              >
                Local
              </button>
              {ldapProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedProvider.type === "ldap" &&
                    selectedProvider.id === provider.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() =>
                    setSelectedProvider({
                      type: "ldap",
                      id: provider.id,
                      name: provider.name,
                    })
                  }
                >
                  {provider.name}
                </button>
              ))}
            </div>
          )}

          {!providersLoaded && (
            // While the SSO providers list is in flight we can't decide whether
            // to render the form. A skeleton avoids the visible flicker where
            // the form briefly renders then disappears once OIDC providers
            // resolve.
            <div className="flex items-center justify-center py-8" aria-busy="true">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {providersLoaded && showLocalForm && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your username"
                          autoComplete="username"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          )}

          {providersLoaded && redirectProviders.length > 0 && (
            <>
              {showLocalForm && (
                <div className="relative my-4">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                    or continue with
                  </span>
                </div>
              )}
              <div className="space-y-2">
                {redirectProviders.map((provider) => (
                  <Button
                    key={provider.id}
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (provider.login_url.startsWith('/')) {
                        window.location.href = provider.login_url;
                      }
                    }}
                  >
                    <LogIn className="size-4 mr-2" />
                    Sign in with {provider.name}
                  </Button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      )}
    </>
  );
}
