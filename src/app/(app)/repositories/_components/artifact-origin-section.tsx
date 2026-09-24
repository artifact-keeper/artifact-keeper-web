"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { repositoriesApi } from "@/lib/api/repositories";
import type { ArtifactOrigin, ArtifactOriginKind } from "@/types";

/** Human label for how an artifact entered the registry (artifact-keeper#4135). */
const ORIGIN_KIND_LABELS: Record<Exclude<ArtifactOriginKind, "unknown">, string> = {
  hosted: "Uploaded",
  proxy: "Fetched from upstream through a proxy",
  virtual: "Stored in a virtual repository",
  migration: "Imported by a migration",
};

export function originKindLabel(origin: ArtifactOrigin): string {
  // A kind this build does not model is shown as the backend sent it.
  return origin.kind === "unknown" ? origin.raw_kind : ORIGIN_KIND_LABELS[origin.kind];
}

function OriginRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
      <span className="text-muted-foreground text-xs font-medium pt-0.5">{label}</span>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  );
}

/**
 * The "Origin" block of the artifact detail dialog (#914): how the artifact's
 * bytes entered the registry, and from where.
 *
 * Since artifact-keeper#4190 a promoted or approved copy keeps the source
 * artifact's origin, so the origin repository can differ from the one the
 * artifact now lives in. That case reads "Originally from <repo>", never as
 * if the current repository were the origin. The origin repository is linked
 * only once the caller's own lookup of it succeeds, so a repository the viewer
 * cannot see (or that was deleted) stays plain text.
 *
 * Renders nothing without an origin: listings and older backends carry none.
 */
export function ArtifactOriginSection({
  origin,
  currentRepositoryKey,
}: {
  origin: ArtifactOrigin | null | undefined;
  currentRepositoryKey: string;
}) {
  const originKey = origin?.repository_key;
  const fromElsewhere = !!originKey && originKey !== currentRepositoryKey;
  // Same key and fetcher as the repository page, so a visit there is cached.
  const { data: originRepo } = useQuery({
    queryKey: ["repository", originKey],
    queryFn: () => repositoriesApi.get(originKey as string),
    enabled: fromElsewhere,
    retry: false,
  });

  if (!origin) return null;

  return (
    <div className="space-y-3" data-testid="artifact-origin">
      <p className="text-xs font-medium text-muted-foreground">Origin</p>
      <OriginRow label="Entered as">
        <span title={origin.raw_kind}>{originKindLabel(origin)}</span>
      </OriginRow>
      <OriginRow label="Repository">
        {fromElsewhere ? (
          <span>
            Originally from{" "}
            {originRepo ? (
              <Link
                href={`/repositories/${encodeURIComponent(origin.repository_key)}`}
                className="font-medium underline underline-offset-2"
              >
                {origin.repository_key}
              </Link>
            ) : (
              <span className="font-medium">{origin.repository_key}</span>
            )}
          </span>
        ) : (
          <span>{origin.repository_key} (this repository)</span>
        )}
      </OriginRow>
      {origin.upstream_url && (
        <OriginRow label="Upstream">
          {/* Printed, not linked: the value is recorded data, not a URL we vouch for. */}
          <span className="font-mono text-xs" title={origin.upstream_url}>
            {origin.upstream_url}
          </span>
        </OriginRow>
      )}
    </div>
  );
}
