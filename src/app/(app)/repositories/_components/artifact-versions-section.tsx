"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, History } from "lucide-react";
import { toast } from "sonner";

import { versionsApi, getVersionDownloadPath } from "@/lib/api/versions";
import type { ArtifactVersionEntry } from "@/lib/api/versions";
import { artifactsApi } from "@/lib/api/artifacts";
import { formatBytes } from "@/lib/utils";
import type { Artifact } from "@/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { CopyButton } from "@/components/common/copy-button";

interface ArtifactVersionsSectionProps {
  repoKey: string;
  artifact: Artifact;
}

/** Shorten a SHA-256 for table display; the full value stays on the copy button. */
export function shortChecksum(checksum: string): string {
  return checksum.length > 12 ? `${checksum.slice(0, 12)}…` : checksum;
}

/**
 * Version history for one artifact coordinate (#571, backend
 * artifact-keeper#2367). Rendered as a tab in the artifact detail dialog for
 * repositories with `versioning_enabled` (Generic/Mlmodel). Lists the stored
 * revisions newest first with a per-revision download that pins the exact
 * stored bytes via `?version=<revision>`.
 *
 * An artifact with no recorded history (e.g. uploaded once and never
 * re-uploaded, or a HEAD predating the feature) renders a quiet empty state —
 * the normal single-artifact download in the dialog footer is unaffected.
 */
export function ArtifactVersionsSection({
  repoKey,
  artifact,
}: ArtifactVersionsSectionProps) {
  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["artifact-versions", repoKey, artifact.path],
    queryFn: () => versionsApi.list(repoKey, artifact.path),
  });

  const handleDownloadRevision = async (entry: ArtifactVersionEntry) => {
    const url = getVersionDownloadPath(repoKey, artifact.path, entry.revision);
    let href = url;
    try {
      // The ticket binds to the request *path* only, so it composes with the
      // `?version=` selector (see getVersionDownloadPath).
      const ticket = await artifactsApi.createDownloadTicket(
        repoKey,
        artifact.path
      );
      href = `${url}&ticket=${ticket}`;
    } catch {
      // Fall back to cookie auth, same as the HEAD download path.
    }
    try {
      const link = document.createElement("a");
      link.href = href;
      link.download = artifact.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error(`Could not start download for revision ${entry.revision}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="artifact-versions-loading">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert data-testid="artifact-versions-error">
        <History className="size-4" />
        <AlertDescription>
          Version history is unavailable for this artifact right now.
        </AlertDescription>
      </Alert>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed p-6 text-center"
        data-testid="artifact-versions-empty"
      >
        <p className="text-sm text-muted-foreground">
          No version history recorded for this artifact.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          History starts with the first re-upload after versioning is enabled;
          until then the single stored copy is downloadable as usual.
        </p>
      </div>
    );
  }

  const latestRevision = items.reduce(
    (max, v) => (v.revision > max ? v.revision : max),
    0
  );
  const showUploader = items.some((v) => v.uploaded_by);

  return (
    <div className="space-y-3" data-testid="artifact-versions-section">
      <p className="text-xs text-muted-foreground">
        Every different-bytes upload of this path is kept as an immutable
        revision. Downloading a revision pins the exact stored bytes via{" "}
        <code>?version=</code>.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Revision</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>SHA-256</TableHead>
            {showUploader && <TableHead>Uploaded by</TableHead>}
            <TableHead>Stored</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((v) => (
            <TableRow key={v.revision} data-testid="artifact-version-row">
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{v.revision}</span>
                  {v.revision === latestRevision && (
                    <Badge variant="outline" className="text-xs font-normal">
                      latest
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {v.version_label ? (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {v.version_label}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {formatBytes(v.size_bytes)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <code className="text-xs" title={v.checksum_sha256}>
                    {shortChecksum(v.checksum_sha256)}
                  </code>
                  <CopyButton value={v.checksum_sha256} />
                </div>
              </TableCell>
              {showUploader && (
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {v.uploaded_by ?? "unknown"}
                  </span>
                </TableCell>
              )}
              <TableCell>
                <span
                  className="text-sm text-muted-foreground"
                  title={new Date(v.created_at).toLocaleString()}
                >
                  {new Date(v.created_at).toLocaleDateString()}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDownloadRevision(v)}
                      aria-label={`Download revision ${v.revision}`}
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Download revision {v.revision}
                  </TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
