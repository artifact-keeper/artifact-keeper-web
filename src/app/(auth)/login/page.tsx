"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Loader2, Lock, LogIn, Shield, Terminal } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { toUserMessage, isAccountLocked } from "@/lib/error-utils";
import { ssoApi } from "@/lib/api/sso";
import { useSystemConfig } from "@/providers/system-config-provider";
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

// Form value shape; the runtime validation schema is created inside the
// component with translated validation messages.
type LoginValues = {
  username: string;
  password: string;
};

type SelectedProvider =
  | { type: "local" }
  | { type: "ldap"; id: string; name: string };

// Names admins commonly leave at their default / placeholder value. When the
// provider's display name is one of these, "Sign in with {name}" reads as
// gibberish ("Sign in with default") — see issue #351. Match case-insensitively.
const GENERIC_PROVIDER_NAMES = new Set(["default", "primary", "main", "sso"]);

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("login");
  const { login, refreshUser, setupRequired, setupPasswordHint, totpRequired, verifyTotp, clearTotpRequired } = useAuth();
  const { config: systemConfig, isLoading: systemConfigLoading } =
    useSystemConfig();

  // Fallback labels by protocol when the provider's name is generic/empty —
  // at least tells the user which protocol they're authenticating with.
  const ssoLabel = (provider: SsoProvider): string => {
    const name = provider.name?.trim();
    if (!name || GENERIC_PROVIDER_NAMES.has(name.toLowerCase())) {
      if (provider.provider_type === "oidc") return t("signInWithSsoOidc");
      if (provider.provider_type === "saml") return t("signInWithSsoSaml");
      return t("signInWithSso");
    }
    return t("signInWithName", { name });
  };
  // Absent on backends predating the flag; the parser defaults it to true so
  // those deployments keep a working login form.
  const localLoginEnabled = systemConfig.auth.local_login_enabled;
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
  // login (the built-in admin account) or LDAP. `auth.local_login_enabled`
  // from GET /api/v1/system/config is the backend's own answer to "should this
  // form be offered": true when no SSO provider is enabled, and under SSO only
  // when the operator set ALLOW_LOCAL_ADMIN_LOGIN without setting
  // SSO_DISABLE_ADMIN_BREAK_GLASS. Rendering the form when it is false is
  // misleading for the ordinary user, because their credentials are rejected
  // (issue #350).
  //
  // The flag is narrower than the login endpoint's own gate, though: under SSO
  // a verified admin keeps a break-glass password path by default (backend
  // #443) that the flag deliberately does not advertise. So `?fallback=local`
  // is not a vestige of the old heuristic, it is the supported way for an admin
  // to reach a form that the server will in fact accept. Safe to expose,
  // because the endpoint enforces the policy itself and rejects everyone else.
  //
  // LDAP is orthogonal: the form is how LDAP credentials are entered, so an
  // enabled LDAP provider shows it regardless of the flag. First-time setup
  // shows it too, so an admin can complete the initial password change with
  // the bootstrap account.
  const forceLocalFallback = searchParams?.get("fallback")?.toLowerCase() === "local";
  const showLocalForm =
    forceLocalFallback ||
    setupRequired ||
    ldapProviders.length > 0 ||
    localLoginEnabled;

  // Both the provider list and the system config feed the form decision, so
  // wait for both before rendering sign-in options. `?fallback=local` short
  // -circuits the wait: neither request is bounded by anything the page
  // controls, and a request that hangs rather than fails would otherwise pin
  // this to false forever and leave a permanent spinner with the escape hatch
  // trapped behind the very condition it exists to escape.
  const optionsLoaded =
    forceLocalFallback || (providersLoaded && !systemConfigLoading);

  const form = useForm<LoginValues>({
    resolver: zodResolver(
      z.object({
        username: z.string().min(1, t("usernameRequired")),
        password: z.string().min(1, t("passwordRequired")),
      })
    ),
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
        setError(toUserMessage(err, t("loginFailed")));
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
      setError(toUserMessage(err, t("invalidTotp")));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {setupRequired && (
        <Alert className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <Terminal className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">{t("firstTimeSetup")}</AlertTitle>
          <AlertDescription>
            <p>{t("setupPasswordGenerated")}</p>
            {/*
              The deployment default (Docker Compose) is baked in here, but an
              operator can override the retrieval instruction via the backend's
              SETUP_PASSWORD_HINT env var (artifact-keeper#2802) so Kubernetes
              and packaged installs can show the right command. When the backend
              provides a hint we render it verbatim; otherwise the built-in
              Docker Compose instruction below is shown unchanged.
            */}
            <code className="mt-1.5 block rounded bg-amber-100 px-2 py-1.5 font-mono text-xs break-all whitespace-pre-wrap dark:bg-amber-950/50">
              {setupPasswordHint ?? "docker exec artifact-keeper-backend cat /data/storage/admin.password"}
            </code>
            <p className="mt-1.5">
              {t.rich("setupLoginHint", {
                username: (chunks) => <strong>{chunks}</strong>,
              })}
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
            <CardTitle className="text-xl">{t("twoFactorTitle")}</CardTitle>
            <CardDescription>{t("twoFactorDescription")}</CardDescription>
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
                {t("backupCode")}
              </p>
              <Button type="submit" className="w-full" size="lg" disabled={isLoading || totpCode.length < 6}>
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("verifying")}
                  </>
                ) : (
                  t("verify")
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
                {t("backToLogin")}
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
          <CardDescription>{setupRequired ? t("completeFirstTimeSetup") : t("signInToAccount")}</CardDescription>
        </CardHeader>
        <CardContent>
          {accountLocked && (
            <Alert className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <Lock className="size-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">{t("accountLocked")}</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                {t("accountLockedDescription")}
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
                {t("local")}
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

          {!optionsLoaded && (
            // While the SSO providers list or the system config is in flight we
            // can't decide whether to render the form. A skeleton avoids the
            // visible flicker where the form briefly renders then disappears
            // once the real sign-in options resolve.
            <div className="flex items-center justify-center py-8" aria-busy="true">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="sr-only">{t("loadingSignInOptions")}</span>
            </div>
          )}

          {optionsLoaded && showLocalForm && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("username")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("usernamePlaceholder")}
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
                      <FormLabel>{t("password")}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={t("passwordPlaceholder")}
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
                      {t("signingIn")}
                    </>
                  ) : (
                    t("signIn")
                  )}
                </Button>
              </form>
            </Form>
          )}

          {optionsLoaded && redirectProviders.length > 0 && (
            <>
              {showLocalForm && (
                <div className="relative my-4">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                    {t("orContinueWith")}
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
                    {ssoLabel(provider)}
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

// useSearchParams() requires a Suspense boundary for static prerendering;
// wrap the inner content so /login can be statically generated. The fallback
// is a brief skeleton matching the eventual loading spinner inside the form.
export default function LoginPage() {
  const t = useTranslations("login");
  useDocumentTitle(t("title"));
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-8" aria-busy="true">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
