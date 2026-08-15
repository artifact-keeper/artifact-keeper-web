"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Target, Info } from "lucide-react";
import { toast } from "sonner";

import { useRepositories } from "@/hooks/use-repositories";
import { repositoriesApi } from "@/lib/api/repositories";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const NONE_VALUE = "__none__";

interface ReleaseTargetSettingsProps {
  repository: Repository;
}

/**
 * Release target configuration for staging repositories (issue #260).
 *
 * A staging repository can be linked to a single local "release" repository of
 * the same package format. Promotions from the staging repo then default to the
 * linked release repo, and promotions to any other repository are rejected by
 * the backend.
 *
 * The picker seeds from the saved link so it survives a revisit. Eligible
 * targets are local repositories sharing the staging repo's format.
 */
export function ReleaseTargetSettings({ repository }: ReleaseTargetSettingsProps) {
  const t = useTranslations("releaseTarget");
  const queryClient = useQueryClient();

  // Only staging repositories support release-target linking.
  const isStaging = repository.repo_type === "staging";

  const { data: repoList, isLoading: candidatesLoading } = useRepositories(
    // Pull local repos of the matching format. The backend enforces the same
    // format + local-type constraints, so this keeps the picker in sync.
    {
      repo_type: "local",
      format: repository.format,
      per_page: 200,
    },
    { enabled: isStaging },
  );

  const candidates = useMemo(
    () => (repoList?.items ?? []).filter((r) => r.id !== repository.id),
    [repoList, repository.id]
  );

  // The saved link, so the picker can show it.
  const { data: currentTarget, isLoading: targetLoading } = useQuery({
    queryKey: ["repository", repository.key, "release-target"],
    queryFn: () => repositoriesApi.getReleaseTarget(repository.key),
    enabled: isStaging,
  });

  const [selected, setSelected] = useState<string>(NONE_VALUE);
  // The value we seeded from. Save stays disabled while the selection still
  // matches it, so a stray click can't unlink an existing target (#462).
  const [synced, setSynced] = useState<string | null>(null);

  const serverValue = currentTarget?.release_repository_key ?? NONE_VALUE;
  const dirty = synced !== null && selected !== synced;

  // Seed from the server during render (same trick as routing-rules-settings),
  // resyncing on change unless the user has unsaved edits.
  if (currentTarget && serverValue !== synced && !dirty) {
    setSynced(serverValue);
    setSelected(serverValue);
  }

  const handleSelect = (value: string) => {
    setSelected(value);
  };

  const saveMutation = useMutation({
    mutationFn: (releaseKey: string) =>
      repositoriesApi.setReleaseTarget(repository.key, releaseKey),
    onSuccess: () => {
      // The saved value is the new baseline, so Save disables right away.
      setSynced(selected);
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success(
        selected === NONE_VALUE
          ? t("linkRemoved")
          : t("saved")
      );
    },
    onError: mutationErrorToast(t("saveFailed")),
  });

  if (!isStaging) {
    return (
      <section aria-labelledby="settings-release-target-heading">
        <div className="flex items-center gap-2 mb-2">
          <Target className="size-4 text-muted-foreground" />
          <h3
            id="settings-release-target-heading"
            className="text-base font-semibold"
          >
            {t("title")}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {t("notStagingDescription")}
        </p>
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            {t("notStaging", { type: repository.repo_type })}
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const handleSave = () => {
    // An empty string tells the backend to remove the link.
    saveMutation.mutate(selected === NONE_VALUE ? "" : selected);
  };

  return (
    <section aria-labelledby="settings-release-target-heading">
      <div className="flex items-center gap-2 mb-2">
        <Target className="size-4 text-muted-foreground" />
        <h3
          id="settings-release-target-heading"
          className="text-base font-semibold"
        >
            {t("title")}
          </h3>
          <Badge variant="secondary" className="text-xs">
            {t("staging")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {t.rich("description", {
            format: (chunks) => (
              <span className="font-medium uppercase">{chunks}</span>
            ),
          })}
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="release-target-select">{t("repoLabel")}</Label>
            {candidatesLoading || targetLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selected} onValueChange={handleSelect}>
                <SelectTrigger id="release-target-select" className="w-full">
                  <SelectValue placeholder={t("selectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>{t("noneOption")}</SelectItem>
                  {candidates.map((repo) => (
                    <SelectItem key={repo.id} value={repo.key}>
                      {repo.name} ({repo.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!candidatesLoading && candidates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("noCandidates", { format: repository.format })}
              </p>
            )}
          </div>

          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || !dirty}
            className="w-fit"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("saving")}
              </>
            ) : (
              t("save")
            )}
          </Button>
        </div>
      </section>
    );
}
