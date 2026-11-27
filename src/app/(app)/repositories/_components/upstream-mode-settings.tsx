"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudOff, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useUpstreamMode } from "@/hooks/use-upstream-mode";
import { repositoriesApi } from "@/lib/api/repositories";
import { mutationErrorToast } from "@/lib/error-utils";
import {
  isForcedByInstance,
  upstreamModeKey,
  upstreamModeLabel,
  type UpstreamMode,
} from "@/lib/upstream-mode";
import type { Repository } from "@/types";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

interface UpstreamModeSettingsProps {
  repository: Repository;
  /**
   * Whether the caller may change the mode. The backend requires the
   * `write:repositories` scope and repository administration (an instance
   * administrator, or the repository `admin` action).
   */
  canEdit: boolean;
}

/**
 * Upstream mode of a Remote repository (#1094, artifact-keeper#5315): online
 * or cache-only, with a confirmation before either switch.
 *
 * Renders nothing for any other repository type, and nothing when the backend
 * cannot report the mode (an older backend), rather than a toggle that would
 * show the wrong state.
 */
export function UpstreamModeSettings({ repository, canEdit }: UpstreamModeSettingsProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useUpstreamMode(repository);
  // The mode the confirmation dialog would switch to; `null` while closed.
  const [pending, setPending] = useState<UpstreamMode | null>(null);

  const mutation = useMutation({
    mutationFn: (mode: UpstreamMode) => repositoriesApi.setUpstreamMode(repository.key, mode),
    onSuccess: (info) => {
      queryClient.setQueryData(upstreamModeKey(repository.key), info);
      setPending(null);
      toast.success(
        info.upstream_mode === "cache_only"
          ? "Repository is now cache-only"
          : "Repository is back online",
      );
    },
    onError: (error) => {
      setPending(null);
      mutationErrorToast("Failed to change the upstream mode")(error);
    },
  });

  // Nothing is read for a non-Remote, so this also hides the section there.
  // `null`: the backend has no upstream mode. An error leaves the mode
  // unknown, which is no better.
  if (!isLoading && (data == null || isError)) return null;

  const stored = data?.upstream_mode;
  const forced = isForcedByInstance(data);

  // The fragment's separator closes this section in the settings column.
  return (
    <>
      <section aria-labelledby="settings-upstream-mode-heading">
        <div className="flex items-center gap-2 mb-2">
          <CloudOff className="size-4 text-muted-foreground" />
          <h3 id="settings-upstream-mode-heading" className="text-base font-semibold">
            Upstream Mode
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          A cache-only Remote never contacts its upstream. It serves what it has
          already cached, fresh or stale, and answers a cache miss with 404. Use
          it on a disconnected or air-gapped instance.
        </p>

        {isLoading || !data ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="settings-upstream-mode">Cache-only</Label>
                <p className="text-xs text-muted-foreground">
                  Effective mode:{" "}
                  <span className="font-medium" data-testid="effective-upstream-mode">
                    {upstreamModeLabel(data.effective_upstream_mode)}
                  </span>
                  {forced && " (set by the instance)"}
                </p>
              </div>
              <Switch
                id="settings-upstream-mode"
                checked={stored === "cache_only"}
                disabled={!canEdit || mutation.isPending}
                onCheckedChange={(checked) => setPending(checked ? "cache_only" : "online")}
              />
            </div>

            {forced && (
              <Alert>
                <Info className="size-4" />
                <AlertDescription>
                  <p>
                    This instance runs with <code>PROXY_UPSTREAM_MODE=cache_only</code>,
                    so every Remote is cache-only whatever its own setting. This
                    repository&apos;s setting is {upstreamModeLabel(data.upstream_mode).toLowerCase()} and
                    applies once that is removed.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {!canEdit && (
              <p className="text-xs text-muted-foreground">
                Only a repository administrator can change the upstream mode.
              </p>
            )}
          </div>
        )}

        <AlertDialog
          open={pending !== null}
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) setPending(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pending === "cache_only"
                  ? "Make this Remote cache-only?"
                  : "Put this Remote back online?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pending === "cache_only"
                  ? `${repository.key} will stop contacting its upstream. It serves only what it has already cached, without revalidating, and every cache miss returns 404 until you put it back online.`
                  : `${repository.key} will contact its upstream again: cache misses are fetched and cached entries revalidated as usual.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={mutation.isPending}
                onClick={(e) => {
                  // Keep the dialog open until the request settles.
                  e.preventDefault();
                  if (pending) mutation.mutate(pending);
                }}
              >
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {pending === "cache_only" ? "Make cache-only" : "Put online"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
      <Separator />
    </>
  );
}
