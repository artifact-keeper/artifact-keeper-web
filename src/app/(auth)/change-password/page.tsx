"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Lock, Shield, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { toUserMessage, isPasswordReuseError } from "@/lib/error-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { PasswordPolicyHint } from "@/components/common/password-policy-hint";

type ChangePasswordValues = z.infer<ReturnType<typeof buildSchema>>;

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      currentPassword: z.string().min(1, t("currentRequired")),
      newPassword: z.string().min(8, t("minLength")),
      confirmPassword: z.string().min(1, t("confirmRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("mismatch"),
      path: ["confirmPassword"],
    });
}

export default function ChangePasswordPage() {
  const t = useTranslations("changePassword");
  useDocumentTitle(t("title"));
  const router = useRouter();
  const { changePassword, logout, setupRequired } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const changePasswordSchema = useMemo(() => buildSchema(t), [t]);

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: ChangePasswordValues) {
    setIsLoading(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      toast.success(t("changedSuccess"));
      router.push("/");
    } catch (err) {
      if (isPasswordReuseError(err)) {
        const reuse = t("passwordReuse");
        form.setError("newPassword", { message: reuse });
        toast.error(reuse);
      } else {
        toast.error(toUserMessage(err, t("changeFailed")));
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className={`mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl ${setupRequired ? "bg-blue-100 dark:bg-blue-950/30" : "bg-amber-100 dark:bg-amber-950/30"}`}>
          {setupRequired ? (
            <Shield className="size-7 text-blue-600 dark:text-blue-400" />
          ) : (
            <Lock className="size-7 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <CardTitle className="text-xl">{setupRequired ? t("setupTitle") : t("title")}</CardTitle>
        <CardDescription>
          {setupRequired ? t("setupDesc") : t("changeDesc")}
        </CardDescription>
        {setupRequired && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-left text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("lockedHint")}</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("currentLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("currentPlaceholder")}
                      autoComplete="current-password"
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
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("newLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("newPlaceholder")}
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <PasswordPolicyHint password={field.value} className="mt-1" />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("confirmLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("confirmPlaceholder")}
                      autoComplete="new-password"
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
                  {t("changing")}
                </>
              ) : (
                t("changePassword")
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleLogout}
              disabled={isLoading}
            >
              {t("logoutInstead")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
