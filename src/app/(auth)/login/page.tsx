"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { ssoApi } from "@/lib/api/sso";
import type { SsoProvider } from "@/types/sso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const { login, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<SelectedProvider>({
    type: "local",
  });

  useEffect(() => {
    ssoApi.listProviders().then(setSsoProviders).catch(() => {});
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
        const needsPasswordChange = await login(
          values.username,
          values.password
        );
        if (needsPasswordChange) {
          router.push("/change-password");
        } else {
          router.push("/");
        }
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Login failed. Please check your credentials.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
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
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
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

        {redirectProviders.length > 0 && (
          <>
            <div className="relative my-4">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                or continue with
              </span>
            </div>
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
  );
}
