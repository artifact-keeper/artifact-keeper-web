"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Target, Info } from "lucide-react";
import { toast } from "sonner";

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
 * The backend has no GET that returns the current link, so this control is a
 * write-through "set the release target" form. Eligible targets are local
 * repositories that share the staging repo's format.
 */
export function ReleaseTargetSettings({ repository }: ReleaseTargetSettingsProps) {
  const queryClient = useQueryClient();

  // Only staging repositories support release-target linking.
  const isStaging = repository.repo_type === "staging";

  const { data: repoList, isLoading: candidatesLoading } = useQuery({
    queryKey: ["repositories", "release-target-candidates", repository.format],
    // Pull local repos of the matching format. The backend enforces the same
    // format + local-type constraints, so this keeps the picker in sync.
    queryFn: () =>
      repositoriesApi.list({
        repo_type: "local",
        format: repository.format,
        per_page: 200,
      }),
    enabled: isStaging,
  });

  const candidates = useMemo(
    () => (repoList?.items ?? []).filter((r) => r.id !== repository.id),
    [repoList, repository.id]
  );

  const [selected, setSelected] = useState<string>(NONE_VALUE);

  const saveMutation = useMutation({
    mutationFn: (releaseKey: string) =>
      repositoriesApi.setReleaseTarget(repository.key, releaseKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toast.success(
        selected === NONE_VALUE
          ? "Release target link removed"
          : "Release target saved"
      );
    },
    onError: mutationErrorToast("Failed to save release target"),
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
            Release Target
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Release-target promotion links artifacts from a staging repository to a
          release repository.
        </p>
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            Release targets are only available for staging repositories. This
            repository is a <span className="capitalize">{repository.repo_type}</span>{" "}
            repository.
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
          Release Target
        </h3>
        <Badge variant="secondary" className="text-xs">
          Staging
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Link this staging repository to a release repository. Promotions from
        here default to the linked target, and promotions elsewhere are rejected.
        The target must be a local repository using the same{" "}
        <span className="font-medium uppercase">{repository.format}</span> format.
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="release-target-select">Release repository</Label>
          {candidatesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="release-target-select" className="w-full">
                <SelectValue placeholder="Select a release repository" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>No release target (unlink)</SelectItem>
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
              No eligible release repositories found. Create a local{" "}
              <span className="uppercase">{repository.format}</span> repository to
              use as a release target.
            </p>
          )}
        </div>

        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="w-fit"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save release target"
          )}
        </Button>
      </div>
    </section>
  );
}
