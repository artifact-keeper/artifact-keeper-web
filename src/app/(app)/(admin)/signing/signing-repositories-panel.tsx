"use client";

import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { FileSignature, Settings2 } from "lucide-react";

import { repositoriesApi } from "@/lib/api/repositories";
import signingApi from "@/lib/api/signing";
import {
  metadataLabel,
  supportsRepositorySigning,
} from "@/lib/signing-formats";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function SigningRepositoriesPanel() {
  const { data: repoList, isLoading: reposLoading } = useQuery({
    queryKey: ["repositories", "signing-overview"],
    queryFn: () => repositoriesApi.list({ per_page: 200 }),
  });

  const signableRepos = (repoList?.items ?? []).filter((repo) =>
    supportsRepositorySigning(repo.format, repo.repo_type),
  );

  const configQueries = useQueries({
    queries: signableRepos.map((repo) => ({
      queryKey: ["signing-config", repo.id],
      queryFn: () => signingApi.getRepoConfig(repo.id),
      enabled: signableRepos.length > 0,
    })),
  });

  const loading = reposLoading || configQueries.some((q) => q.isLoading);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (signableRepos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-muted-foreground">
        <FileSignature className="size-8 mb-2 opacity-50" />
        <p className="text-sm">No signable repositories found.</p>
        <p className="text-xs">
          Create a Debian, RPM, Alpine, or Conda repository (local, staging, or virtual) first.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {signableRepos.map((repo, index) => {
        const config = configQueries[index]?.data;
        const enabled =
          !!config?.signing_key_id &&
          (config.sign_metadata || config.sign_packages || config.require_signatures);
        const keyName = config?.key?.name;

        return (
          <li key={repo.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{repo.name}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {repo.key}
                </Badge>
                <Badge variant="secondary" className="uppercase text-xs">
                  {repo.format}
                </Badge>
                <Badge variant="outline" className="capitalize text-xs">
                  {repo.repo_type}
                </Badge>
                {enabled ? (
                  <Badge variant="secondary">Signing enabled</Badge>
                ) : (
                  <Badge variant="outline">Not configured</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {enabled && keyName ? (
                  <>
                    Key: <span className="font-medium text-foreground">{keyName}</span>
                    {config?.sign_metadata && (
                      <> · signs {metadataLabel(repo.format)}</>
                    )}
                  </>
                ) : (
                  <>No signing key bound to this repository yet.</>
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/repositories/${encodeURIComponent(repo.key)}?tab=settings`}>
                <Settings2 className="size-4" />
                Configure
              </Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
