"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { BuildArtifact } from "@/types/builds";

/**
 * A build artifact's name. One that links a stored artifact opens the
 * repository holding it and names it, one whose artifact is in the trash
 * says so
 */
export function BuildArtifactName({ artifact }: { artifact: BuildArtifact }) {
  if (!artifact.artifact_id || !artifact.repository_key) {
    return <span className="truncate">{artifact.name}</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {artifact.artifact_deleted ? (
        <span className="truncate">{artifact.name}</span>
      ) : (
        <Link
          href={`/repositories/${encodeURIComponent(artifact.repository_key)}`}
          aria-label={`${artifact.name}, open repository ${artifact.repository_key}`}
          className="truncate text-blue-600 hover:underline dark:text-blue-400"
        >
          {artifact.name}
        </Link>
      )}
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {artifact.repository_key}
      </Badge>
      {artifact.artifact_deleted && (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          in trash
        </Badge>
      )}
    </span>
  );
}
