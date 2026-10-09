"use client";

import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";

import {
  allowlistQueryKey,
  condaAllowlistApi,
  supportsCondaAllowlist,
  type CondaAllowlist,
} from "@/lib/api/conda-allowlist";
import { allowlistStateLabel } from "@/lib/conda-allowlist";
import type { Repository } from "@/types";

/** The summary text for an allowlist response, e.g. "on, 43 entries". */
export function allowlistSummaryText(list: CondaAllowlist): string {
  if (list.error) return "unreadable, nothing from remote members is admitted";
  if (!list.enabled && list.entry_count === 0) return "off";
  return allowlistStateLabel(list.enabled, list.entry_count);
}

interface CondaAllowlistSummaryProps {
  repository: Repository;
  /** Whether to ask at all (signed in; the endpoint is repository-admin only). */
  enabled: boolean;
  /** Open the allowlist section (switches tab and scrolls to it). */
  onOpen: () => void;
}

/**
 * "Allowlist: on, 43 entries" on the overview of a virtual conda repository
 * (#971). Renders nothing for other repositories and for users the backend
 * does not show the list to (it answers 403 to non-admins).
 */
export function CondaAllowlistSummary({ repository, enabled, onOpen }: CondaAllowlistSummaryProps) {
  const supported = supportsCondaAllowlist(repository);
  const { data } = useQuery({
    queryKey: allowlistQueryKey(repository.key),
    queryFn: () => condaAllowlistApi.get(repository.key),
    enabled: supported && enabled,
    retry: false,
  });
  if (!supported || !data) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm" data-testid="allowlist-summary">
      <ListChecks className="size-3.5 text-muted-foreground" aria-hidden />
      <button
        type="button"
        onClick={onOpen}
        className={`underline-offset-4 hover:underline ${data.error ? "text-destructive" : ""}`}
      >
        Allowlist: {allowlistSummaryText(data)}
      </button>
    </p>
  );
}
