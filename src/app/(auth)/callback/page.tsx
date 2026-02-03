"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refresh_token");

    if (token && refreshToken) {
      localStorage.setItem("access_token", token);
      localStorage.setItem("refresh_token", refreshToken);
      router.replace("/");
    } else {
      setError(
        searchParams.get("error") ||
          "Authentication failed. No tokens received from the identity provider."
      );
    }
  }, [searchParams, router]);

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
