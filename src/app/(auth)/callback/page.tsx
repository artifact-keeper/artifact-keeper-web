"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function getSsoErrorMessage(errorCode: string | null): string {
  const messages: Record<string, string> = {
    access_denied: "Access was denied by the identity provider.",
    invalid_request: "The authentication request was invalid.",
    server_error: "The identity provider encountered an error.",
    temporarily_unavailable: "The identity provider is temporarily unavailable.",
    expired: "The authentication session has expired. Please try again.",
    invalid_code: "The authentication code is invalid or has expired.",
  };
  if (!errorCode) return "Authentication failed. Please try again.";
  return messages[errorCode] || "Authentication failed. Please try again.";
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const code = searchParams.get("code");
  const urlError = searchParams.get("error");

  useEffect(() => {
    if (urlError) {
      setError(getSsoErrorMessage(urlError));
      return;
    }

    if (!code) {
      setError(
        "Authentication failed. No authorization code received from the identity provider."
      );
      return;
    }

    // Exchange the single-use code for tokens via a secure POST request
    const exchangeCode = async () => {
      try {
        const response = await fetch("/api/v1/auth/sso/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message =
            body?.message ||
            body?.error ||
            "Failed to exchange authorization code. It may have expired.";
          setError(message);
          return;
        }

        // Tokens are now set as httpOnly cookies by the backend.
        // No need to store them in localStorage.
        router.replace("/");
      } catch {
        setError("Failed to complete sign-in. Please try again.");
      }
    };

    exchangeCode();
  }, [code, urlError, router]);

  if (error) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTitle>SSO Login Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => router.push("/login")}>
              Back to Login
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
          Completing sign-in...
        </p>
      </CardContent>
    </Card>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense
      fallback={
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
