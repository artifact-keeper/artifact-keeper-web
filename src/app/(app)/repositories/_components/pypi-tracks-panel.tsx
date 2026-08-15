"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Loader2, Link2, ShieldCheck } from "lucide-react";

import { pypiTracksApi, type PypiTrack } from "@/lib/api/pypi-tracks";
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
  const t = useTranslations("app/repositories/_components/pypi-tracks-panel");
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
      toast.success(t("declared", { project: proj }));
    },
    onError: mutationErrorToast(t("declareFailed")),
  });

  const removeMutation = useMutation({
    mutationFn: (proj: string) => pypiTracksApi.remove(repository.key, proj),
    onSuccess: () => {
      invalidate();
      setTrackToRemove(null);
      toast.success(t("removed"));
    },
    onError: mutationErrorToast(t("removeFailed")),
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
          {t.rich("description", {
            track: (chunks) => (
              <span className="font-medium text-foreground">{chunks}</span>
            ),
          })}
        </p>
      </div>

      {/* Add form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        aria-label={t("formAria")}
      >
        <Input
          placeholder={t("projectPlaceholder")}
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label={t("projectAria")}
          className="sm:max-w-xs"
        />
        <Input
          placeholder={t("urlPlaceholder")}
          value={tracksUrl}
          onChange={(e) => setTracksUrl(e.target.value)}
          aria-label={t("urlAria")}
          inputMode="url"
        />
        <Button type="submit" disabled={!canSubmit}>
          {upsertMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {t("add")}
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
          <p className="text-sm">{t("empty")}</p>
          <p className="text-xs">{t("emptyDetail")}</p>
        </div>
      )}

      {!isLoading && (tracks?.length ?? 0) > 0 && (
        <ul className="divide-y rounded-md border">
          {tracks!.map((track) => (
            <li
              key={track.normalized_name}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{track.normalized_name}</p>
                <p className="truncate text-xs text-muted-foreground">{track.tracks_url}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("removeAria", { name: track.normalized_name })}
                onClick={() => setTrackToRemove(track)}
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
        title={t("confirmTitle")}
        description={
          trackToRemove
            ? t("confirmDescription", { name: trackToRemove.normalized_name })
            : ""
        }
        confirmText={t("confirmRemove")}
        danger
        loading={removeMutation.isPending}
        onConfirm={() => {
          if (trackToRemove) removeMutation.mutate(trackToRemove.normalized_name);
        }}
      />
    </div>
  );
}
