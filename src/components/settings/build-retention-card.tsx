"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Hammer, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsApi, type BuildRetention } from "@/lib/api/settings";
import { mutationErrorToast } from "@/lib/error-utils";

export const BUILD_RETENTION_QUERY_KEY = ["admin-settings", "build-retention"];

/** A whole number of 0 or more, `null` for anything else */
export function parseRetentionValue(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null;
}

/**
 * Hourly cleanup of CI build records (#618). Renders nothing against a
 * backend that has no build retention
 */
export function BuildRetentionCard({ className }: { className?: string }) {
  const { data } = useQuery({
    queryKey: BUILD_RETENTION_QUERY_KEY,
    queryFn: () => settingsApi.getBuildRetention(),
  });
  if (!data) return null;
  return (
    <BuildRetentionForm
      key={`${data.days}:${data.keep_last}`}
      stored={data}
      className={className}
    />
  );
}

function BuildRetentionForm({
  stored,
  className,
}: {
  stored: BuildRetention;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(String(stored.days));
  const [keepLast, setKeepLast] = useState(String(stored.keep_last));
  const parsedDays = parseRetentionValue(days);
  const parsedKeep = parseRetentionValue(keepLast);
  const valid = parsedDays !== null && parsedKeep !== null;
  const changed = parsedDays !== stored.days || parsedKeep !== stored.keep_last;

  const save = useMutation({
    mutationFn: (value: BuildRetention) => settingsApi.updateBuildRetention(value),
    onSuccess: () => {
      toast.success("Build retention saved");
      queryClient.invalidateQueries({ queryKey: BUILD_RETENTION_QUERY_KEY });
    },
    onError: mutationErrorToast("Failed to save build retention"),
  });

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hammer className="size-4" />
          Build retention
        </CardTitle>
        <CardDescription>
          Build records are cleaned up every hour. Only the records go, the
          artifacts in repositories stay. 0 turns a rule off
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="build-retention-days">Delete builds older than (days)</Label>
            <Input
              id="build-retention-days"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-invalid={parsedDays === null}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="build-retention-keep-last">Keep the newest builds per name</Label>
            <Input
              id="build-retention-keep-last"
              inputMode="numeric"
              value={keepLast}
              onChange={(e) => setKeepLast(e.target.value)}
              aria-invalid={parsedKeep === null}
            />
          </div>
        </div>
        {!valid && (
          <p className="text-sm text-destructive">Use a whole number, 0 or more</p>
        )}
        <Button
          size="sm"
          disabled={!valid || !changed || save.isPending}
          onClick={() =>
            valid && save.mutate({ days: parsedDays, keep_last: parsedKeep })
          }
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
