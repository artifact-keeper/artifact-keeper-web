"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsApi } from "@/lib/api/settings";
import { ApiError, apiErrorMessage } from "@/lib/api/fetch";
import { toUserMessage } from "@/lib/error-utils";
import {
  ADMIN_SETTINGS_QUERY_KEY,
  useAdminSettings,
} from "@/hooks/use-admin-settings";

/**
 * Why a save was refused, in words an administrator can act on. The backend
 * answers 400 for anything but an absolute http(s) URL with no whitespace or
 * control characters, and names which rule failed.
 */
function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 400) {
    const said = apiErrorMessage(err);
    return `The link was not saved. ${
      said ?? "It has to be an absolute http or https URL."
    } Placeholders such as {package} are filled in for you.`;
  }
  return toUserMessage(err, "Failed to save the exception request link");
}

/**
 * Settings > Security: the "request an exception" link every gate refusal
 * carries (artifact-keeper#5782). Left empty, refusals point at this UI's own
 * `/exceptions/request` page; a template sends people to a ticketing system
 * instead. Hidden on a backend that does not report the setting.
 */
export function ExceptionRequestLinkCard() {
  const { data } = useAdminSettings();
  const current = data?.exceptionRequestUrl;
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (template: string) =>
      settingsApi.updateExceptionRequestUrl(template),
    onSuccess: (_r, template) => {
      setError(null);
      setValue(null);
      queryClient.invalidateQueries({ queryKey: ADMIN_SETTINGS_QUERY_KEY });
      toast.success(
        template.trim()
          ? "Exception request link saved"
          : "Exception request link cleared; refusals use the built-in page",
      );
    },
    onError: (err: unknown) => setError(saveErrorMessage(err)),
  });

  if (current === undefined) return null;

  // Local edits win; otherwise show what is stored.
  const shown = value ?? current ?? "";
  const dirty = value !== null && value.trim() !== (current ?? "");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Exception request link</CardTitle>
        </div>
        <CardDescription>
          Every refusal from the age, scan or curation gate carries a link for
          asking for an exception. Leave this empty to use this
          instance&apos;s own request page, which needs the backend&apos;s
          external URL to be set. Enter a template to send people to your
          ticketing system instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="exception-request-url" className="text-sm">
          Link template
        </Label>
        <div className="flex gap-2">
          <Input
            id="exception-request-url"
            inputMode="url"
            placeholder="https://tickets.example/new?pkg={package}&v={version}"
            value={shown}
            aria-invalid={error !== null}
            aria-describedby={
              error
                ? "exception-request-url-help exception-request-url-error"
                : "exception-request-url-help"
            }
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            className="flex-1"
          />
          <Button
            onClick={() => save.mutate(shown)}
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
        <p
          id="exception-request-url-help"
          className="text-xs text-muted-foreground"
        >
          Placeholders: <code>{"{gate}"}</code>, <code>{"{repo}"}</code>,{" "}
          <code>{"{package}"}</code>, <code>{"{version}"}</code>, each
          URL-encoded. Must be an absolute http or https URL.
        </p>
        {error && (
          <p
            id="exception-request-url-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
