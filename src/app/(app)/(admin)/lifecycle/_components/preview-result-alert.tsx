"use client";

import { Eye } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatBytes } from "@/lib/utils";
import type { PolicyExecutionResult } from "@/types/lifecycle";

export interface PreviewResultAlertProps {
  result: PolicyExecutionResult;
}

/**
 * The outcome of a policy dry run.
 *
 * The size figure comes from `bytes_matched` (backend 1.10.0,
 * artifact-keeper#2024), not `bytes_freed`: a dry run frees nothing, so
 * `bytes_freed` is legitimately 0 and the panel used to report every preview
 * as "free 0 B" — which reads as "there is nothing to clean up". A backend
 * without the field reports the artifact count alone rather than a made-up 0.
 */
export function PreviewResultAlert({ result }: PreviewResultAlertProps) {
  const { artifacts_matched: matched, bytes_matched: bytes } = result;

  return (
    <Alert>
      <Eye className="size-4" />
      <AlertTitle>Preview: {result.policy_name}</AlertTitle>
      <AlertDescription>
        Would delete {matched} {matched === 1 ? "artifact" : "artifacts"}
        {bytes !== null && <> and reclaim {formatBytes(bytes)}</>}. Nothing has
        been deleted.
        {result.errors.length > 0 && (
          <span className="text-destructive">
            {" "}
            {result.errors.length} error(s).
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
