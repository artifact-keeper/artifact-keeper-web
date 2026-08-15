"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "@/lib/sdk-client";
import { useDocumentTitle } from "@/hooks/use-document-title";

function getSsoErrorKey(errorCode: string | null): string {
  const messages: Record<string, string> = {
    access_denied: "errorAccessDenied",
    invalid_request: "errorInvalidRequest",
    server_error: "errorServerError",
    temporarily_unavailable: "errorTemporarilyUnavailable",
    expired: "errorExpired",
    invalid_code: "errorInvalidCode",
  };
  if (!errorCode) return "errorGeneric";
  return messages[errorCode] || "errorGeneric";
}

function CallbackHandler() {
  const t = useTranslations("auth/callback");
  useDocumentTitle(t("signingIn"));
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  const code = searchParams.get("code");
  const urlError = searchParams.get("error");

  // Derive error state from URL params without calling setState in the effect
  const immediateError = urlError
    ? getSsoErrorKey(urlError)
    : !code
      ? "errorNoCode"
      : null;

  const [error, setError] = useState<string | null>(immediateError);

  useEffect(() => {
    if (immediateError) return;

    // Exchange the single-use code for tokens via a secure POST request
    const exchangeCode = async () => {
      try {
        const response = await fetch("/api/v1/auth/sso/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
          },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const ERROR_KEYS: Record<string, string> = {
            invalid_state: "errorInvalidState",
            invalid_code: "errorInvalidCode",
            provider_error: "errorProviderError",
            user_disabled: "errorUserDisabled",
          };
          const key =
            (body?.error && ERROR_KEYS[body.error]) ||
            (body?.code && ERROR_KEYS[body.code]) ||
            "errorGeneric";
          setError(key);
          return;
        }

        // Tokens are now set as httpOnly cookies by the backend.
        // No need to store them in localStorage.
        await refreshUser();
        router.replace("/");
      } catch {
        setError("errorFailed");
      }
    };

    exchangeCode();
  }, [code, immediateError, refreshUser, router]);

  if (error) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>{t("ssoLoginFailed")}</AlertTitle>
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => router.push("/login")}>
              {t("backToLogin")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          {t("completingSignIn")}
        </p>
      </CardContent>
    </Card>
  );
}

export default function SsoCallbackPage() {
  const t = useTranslations("auth/callback");
  return (
    <Suspense
      fallback={
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </CardContent>
        </Card>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
