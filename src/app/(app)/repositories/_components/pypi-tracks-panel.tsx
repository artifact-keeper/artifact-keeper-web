"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Link2, ShieldCheck } from "lucide-react";

import pypiTracksApi, { type PypiTrack } from "@/lib/api/pypi-tracks";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

interface PypiTracksPanelProps {
  repository: Repository;
}

const TRACKS_QUERY_KEY = (key: string) => ["pypi-tracks", key];

/**
 * Admin panel for managing PEP 708 `tracks` declarations on a PyPI virtual
 * repository (artifact-keeper#1600). By default a virtual isolates a
 * locally-owned project name from the same name upstream; declaring a track
 * re-unions that project with a named upstream Simple index.
 */
export function PypiTracksPanel({ repository }: PypiTracksPanelProps) {
  const queryClient = useQueryClient();
  const [project, setProject] = useState("");
  const [tracksUrl, setTracksUrl] = useState("");
  const [trackToRemove, setTrackToRemove] = useState<PypiTrack | null>(null);

  const { data: tracks, isLoading } = useQuery({
    queryKey: TRACKS_QUERY_KEY(repository.key),
    queryFn: () => pypiTracksApi.list(repository.key),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: TRACKS_QUERY_KEY(repository.key) });

  const upsertMutation = useMutation({
    mutationFn: ({ proj, url }: { proj: string; url: string }) =>
      pypiTracksApi.upsert(repository.key, proj, url),
    onSuccess: (_data, { proj }) => {
      invalidate();
      setProject("");
      setTracksUrl("");
      toast.success(`Tracking declared for "${proj}"`);
    },
    onError: mutationErrorToast("Failed to declare tracks relationship"),
  });

  const removeMutation = useMutation({
    mutationFn: (proj: string) => pypiTracksApi.remove(repository.key, proj),
    onSuccess: () => {
      invalidate();
      setTrackToRemove(null);
      toast.success("Tracks declaration removed");
    },
    onError: mutationErrorToast("Failed to remove tracks relationship"),
  });

  const trimmedProject = project.trim();
  const trimmedUrl = tracksUrl.trim();
  const canSubmit = trimmedProject !== "" && trimmedUrl !== "" && !upsertMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    upsertMutation.mutate({ proj: trimmedProject, url: trimmedUrl });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 mt-0.5 shrink-0 text-emerald-500" />
        <p>
          PyPI virtual repositories isolate locally-owned project names from the same name
          upstream by default (PEP 708, dependency-confusion mitigation). Declare a{" "}
          <span className="font-medium text-foreground">tracks</span> relationship to re-union a
          local project&apos;s versions with a named upstream Simple index.
        </p>
      </div>

      {/* Add form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        aria-label="Declare a tracks relationship"
      >
        <Input
          placeholder="Project name (e.g. acme-sdk)"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Project name"
          className="sm:max-w-xs"
        />
        <Input
          placeholder="https://pypi.org/simple/acme-sdk/"
          value={tracksUrl}
          onChange={(e) => setTracksUrl(e.target.value)}
          aria-label="Upstream Simple index URL"
          inputMode="url"
        />
        <Button type="submit" disabled={!canSubmit}>
          {upsertMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add
        </Button>
      </form>

      {/* List */}
      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!isLoading && (tracks?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-10 text-center text-muted-foreground">
          <Link2 className="size-7 mb-2 opacity-50" />
          <p className="text-sm">No tracks declarations.</p>
          <p className="text-xs">Locally-owned project names are fully isolated from upstream.</p>
        </div>
      )}

      {!isLoading && (tracks?.length ?? 0) > 0 && (
        <ul className="divide-y rounded-md border">
          {tracks!.map((t) => (
            <li
              key={t.normalized_name}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.normalized_name}</p>
                <p className="truncate text-xs text-muted-foreground">{t.tracks_url}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove tracks declaration for ${t.normalized_name}`}
                onClick={() => setTrackToRemove(t)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={trackToRemove !== null}
        onOpenChange={(open) => !open && setTrackToRemove(null)}
        title="Remove tracks declaration?"
        description={
          trackToRemove
            ? `"${trackToRemove.normalized_name}" will be isolated from upstream again. Unpinned installs will resolve only the local project's versions.`
            : ""
        }
        confirmText="Remove"
        danger
        loading={removeMutation.isPending}
        onConfirm={() => {
          if (trackToRemove) removeMutation.mutate(trackToRemove.normalized_name);
        }}
      />
    </div>
  );
}
