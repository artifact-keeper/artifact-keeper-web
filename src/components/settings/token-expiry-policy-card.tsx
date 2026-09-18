"use client";

import { useEffect, useState } from "react";
import { useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { apiErrorMessage } from "@/lib/api/fetch";
import { toUserMessage } from "@/lib/error-utils";
import {
  TOKEN_POLICY_MAX_DAYS,
  TOKEN_POLICY_QUERY_KEY,
  isPolicyPinnedError,
  policyErrorField,
  tokenPolicyApi,
  type ApiTokenExpiryPolicy,
  type TokenPolicySettings,
} from "@/lib/api/token-policy";

/**
 * Admin editor for the instance-wide API token expiration policy
 * (#810, backend artifact-keeper#3460 / #3625).
 *
 * The policy applies at mint time only, so saving it can never invalidate a
 * credential a pipeline is already running on — which is exactly why the two
 * never-expiring-token counters are shown as a rotation to-do: those tokens
 * stay valid until an operator revokes them deliberately.
 *
 * When the `API_TOKEN_EXPIRATION_*` environment variables pin the policy the
 * backend reports `editable: false` and answers `PUT` with a 409, so the form
 * renders read-only rather than offering a save that is guaranteed to fail.
 */

/** Shown when the backend's 409 body carries no message of its own. */
export const POLICY_PINNED_MESSAGE =
  "This policy is pinned by the API_TOKEN_EXPIRATION_* environment variables " +
  "and cannot be changed here. Unset API_TOKEN_EXPIRATION_REQUIRED and " +
  "restart the server to manage it from this page.";

const WHOLE_DAYS = /^\d+$/;

/**
 * The form mirrors the backend's own consistency rules (`min >= 1`,
 * `max <= 3650`, `max >= min`, default inside the range) so the common
 * mistakes are caught before the round trip; the backend stays authoritative
 * and its 400 is mapped back onto the offending field.
 */
const formSchema = z
  .object({
    require_expiration: z.boolean(),
    min_days: z.string().trim().regex(WHOLE_DAYS, "Enter a whole number of days"),
    max_days: z.string().trim().regex(WHOLE_DAYS, "Enter a whole number of days"),
    /** Empty means "no default": enforced mints that omit an expiry are refused. */
    default_days: z.string().trim(),
    apply_to_service_accounts: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const min = Number(values.min_days);
    const max = Number(values.max_days);
    if (WHOLE_DAYS.test(values.min_days) && min < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["min_days"],
        message: "Minimum must be at least 1 day",
      });
    }
    if (WHOLE_DAYS.test(values.max_days) && max > TOKEN_POLICY_MAX_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["max_days"],
        message: `Maximum must be ${TOKEN_POLICY_MAX_DAYS} days or fewer`,
      });
    }
    if (
      WHOLE_DAYS.test(values.min_days) &&
      WHOLE_DAYS.test(values.max_days) &&
      max < min
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["max_days"],
        message: "Maximum must be greater than or equal to the minimum",
      });
    }
    if (values.default_days === "") return;
    if (!WHOLE_DAYS.test(values.default_days)) {
      ctx.addIssue({
        code: "custom",
        path: ["default_days"],
        message: "Enter a whole number of days, or leave empty for no default",
      });
      return;
    }
    const fallback = Number(values.default_days);
    if (
      WHOLE_DAYS.test(values.min_days) &&
      WHOLE_DAYS.test(values.max_days) &&
      (fallback < min || fallback > max)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["default_days"],
        message: `Default must fall between ${min} and ${max} days`,
      });
    }
  });

type PolicyFormValues = z.infer<typeof formSchema>;

function toFormValues(policy: ApiTokenExpiryPolicy): PolicyFormValues {
  return {
    require_expiration: policy.require_expiration,
    min_days: String(policy.min_days),
    max_days: String(policy.max_days),
    default_days: policy.default_days === null ? "" : String(policy.default_days),
    apply_to_service_accounts: policy.apply_to_service_accounts,
  };
}

function toPolicy(values: PolicyFormValues): ApiTokenExpiryPolicy {
  return {
    require_expiration: values.require_expiration,
    min_days: Number(values.min_days),
    max_days: Number(values.max_days),
    default_days: values.default_days === "" ? null : Number(values.default_days),
    apply_to_service_accounts: values.apply_to_service_accounts,
  };
}

const EMPTY_FORM: PolicyFormValues = {
  require_expiration: false,
  min_days: "1",
  max_days: "90",
  default_days: "90",
  apply_to_service_accounts: false,
};

/** "3 user tokens and 1 service-account token", pluralized. */
function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One of the policy's three day bounds. Rendered identically for each. */
function DaysField({
  control,
  name,
  label,
  description,
  placeholder,
  disabled,
}: {
  control: Control<PolicyFormValues>;
  name: "min_days" | "max_days" | "default_days";
  label: string;
  description?: string;
  placeholder?: string;
  disabled: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              min={1}
              max={TOKEN_POLICY_MAX_DAYS}
              placeholder={placeholder}
              disabled={disabled}
              {...field}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function RotationTodo({ settings }: { settings: TokenPolicySettings }) {
  const users = settings.non_expiring_user_tokens;
  const serviceAccounts = settings.non_expiring_service_account_tokens;

  if (users + serviceAccounts === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Rotation to-do: none — every live token already has an expiry.
      </p>
    );
  }

  return (
    <Alert>
      <AlertTitle>Rotation to-do</AlertTitle>
      <AlertDescription>
        {countLabel(users, "user token")} and{" "}
        {countLabel(serviceAccounts, "service-account token")} never expire.
        Changing this policy only affects tokens minted from now on, so these
        keep working until you revoke them from Access Tokens and Service
        Accounts.
      </AlertDescription>
    </Alert>
  );
}

export function TokenExpiryPolicyCard() {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: TOKEN_POLICY_QUERY_KEY,
    queryFn: () => tokenPolicyApi.get(),
  });

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY_FORM,
  });

  // Seed the form from the server once the read resolves, and re-seed after a
  // save (the PUT echoes the stored policy back). `reset` also clears any
  // field errors the previous attempt's 400 set.
  const { reset } = form;
  useEffect(() => {
    if (data) reset(toFormValues(data.policy));
  }, [data, reset]);

  const editable = data?.editable ?? false;
  const pinned = data?.source === "environment";

  const saveMutation = useMutation({
    mutationFn: (policy: ApiTokenExpiryPolicy) => tokenPolicyApi.update(policy),
    onSuccess: (updated) => {
      queryClient.setQueryData(TOKEN_POLICY_QUERY_KEY, updated);
      setSaveError(null);
      toast.success("Token expiry policy saved");
    },
    onError: (err: unknown) => {
      // The backend's own text is the useful part of both refusals: the 409
      // names the environment variable to unset, the 400 names the field and
      // the range it violated. Show it verbatim.
      const backendMessage = apiErrorMessage(err);
      if (isPolicyPinnedError(err)) {
        // The pin may have appeared since this page loaded; refetch so the
        // form switches to read-only instead of inviting another attempt.
        void queryClient.invalidateQueries({ queryKey: TOKEN_POLICY_QUERY_KEY });
        setSaveError(backendMessage ?? POLICY_PINNED_MESSAGE);
        toast.error(backendMessage ?? POLICY_PINNED_MESSAGE);
        return;
      }
      const field = policyErrorField(err);
      if (field && backendMessage) {
        setSaveError(null);
        form.setError(field, { message: backendMessage });
        toast.error(backendMessage);
        return;
      }
      const message =
        backendMessage ?? toUserMessage(err, "Failed to save token expiry policy");
      setSaveError(message);
      toast.error(message);
    },
  });

  const disabled = !editable || saveMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">API token expiry policy</CardTitle>
          {pinned && <Badge variant="secondary">Pinned by environment</Badge>}
        </div>
        <CardDescription>
          Require newly minted API tokens to carry an expiration, and bound how
          long they may last. Applied when a token is created — tokens that
          already exist keep whatever expiry they were minted with. Requires
          backend 1.10.0+.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2" data-testid="token-policy-loading">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : isError || !data ? (
          <Alert variant="destructive">
            <AlertTitle>Policy unavailable</AlertTitle>
            <AlertDescription>
              {toUserMessage(
                error,
                "The token expiry policy endpoint could not be read. It requires backend 1.10.0 or newer.",
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {!editable && (
              <Alert>
                <AlertTitle>Read-only</AlertTitle>
                <AlertDescription>{POLICY_PINNED_MESSAGE}</AlertDescription>
              </Alert>
            )}

            <RotationTodo settings={data} />

            {saveError && (
              <Alert variant="destructive">
                <AlertTitle>Policy not saved</AlertTitle>
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) =>
                  saveMutation.mutate(toPolicy(values)),
                )}
              >
                <FormField
                  control={form.control}
                  name="require_expiration"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <FormLabel>Require expiration</FormLabel>
                        <FormDescription>
                          Refuse or default new tokens that would never expire.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={disabled}
                          aria-label="Require expiration"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-3">
                  <DaysField
                    control={form.control}
                    name="min_days"
                    label="Minimum days"
                    disabled={disabled}
                  />
                  <DaysField
                    control={form.control}
                    name="max_days"
                    label="Maximum days"
                    disabled={disabled}
                  />
                  <DaysField
                    control={form.control}
                    name="default_days"
                    label="Default days"
                    placeholder="No default"
                    description="Applied when a request omits an expiry. Leave empty to refuse those requests instead."
                    disabled={disabled}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="apply_to_service_accounts"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <FormLabel>Apply to service accounts</FormLabel>
                        <FormDescription>
                          Off by default: expiring the credential a pipeline
                          runs on is an outage on a schedule.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={disabled}
                          aria-label="Apply to service accounts"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button type="submit" disabled={disabled}>
                    {saveMutation.isPending && (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    )}
                    Save policy
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
