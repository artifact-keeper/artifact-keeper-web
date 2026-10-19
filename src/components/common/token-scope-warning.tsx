"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  serviceAccountsApi,
  type TokenScopeError,
  type UnreachableMember,
  type UnreachableReason,
  type UnreachableVirtual,
} from "@/lib/api/service-accounts";

/**
 * One line per reason: what it means, and the single thing that fixes it.
 * Kept short on purpose — the row shows a number, and this is what the
 * operator reads after deciding to look.
 */
const REASON_COPY: Record<UnreachableReason, { label: string; fix: string }> = {
  out_of_token_scope: {
    label: "Outside this token's repository scope",
    fix: "Scope the token to the virtual repository (naming the virtual covers reads of its members).",
  },
  no_grant: {
    label: "This service account has no read access",
    fix: "Grant the service account read access on the virtual repository or these member repositories; widening the token's scope cannot fix this.",
  },
};

const SCOPE_ERROR_COPY: Record<
  TokenScopeError,
  { badge: string; ariaLabel: string; label: string; detail: string }
> = {
  invalid_selector: {
    badge: "Invalid selector",
    ariaLabel: "Invalid repository selector, show details",
    label: "Invalid repository selector",
    detail:
      "This token's stored repository selector cannot be parsed or contains an unknown field, so it denies access to all repositories. Recreate the token with a valid selector.",
  },
  selector_matches_nothing: {
    badge: "Matches no repos",
    ariaLabel: "Selector matches no repositories, show details",
    label: "Selector matches no repositories",
    detail:
      "This token's repository selector currently matches no repositories, so it denies access to all repositories until a repository matches its criteria.",
  },
  deleted_pinned_repositories: {
    badge: "Pinned repos deleted",
    ariaLabel: "Pinned repositories deleted, show details",
    label: "Pinned repositories were deleted",
    detail:
      "All repositories this token was pinned to have been deleted, so it denies access to all repositories. Recreate the token with existing repositories.",
  },
};

const REASON_ORDER: UnreachableReason[] = ["no_grant", "out_of_token_scope"];

function groupByReason(unreachable: UnreachableVirtual[]) {
  const groups = new Map<UnreachableReason, string[]>();
  for (const virtualRepo of unreachable) {
    for (const member of virtualRepo.members) {
      const keys = groups.get(member.reason) ?? [];
      keys.push(member.repo_key);
      groups.set(member.reason, keys);
    }
  }
  return REASON_ORDER.filter((reason) => groups.has(reason)).map((reason) => ({
    reason,
    repoKeys: Array.from(new Set(groups.get(reason) ?? [])),
  }));
}

interface TokenScopeWarningProps {
  readonly accountId: string;
  readonly tokenId: string;
  readonly count: number;
  readonly scopeError?: TokenScopeError;
}

/**
 * The token row's flag for artifact-keeper#4215: a count or a scope-error
 * badge, and the detail only once asked for.
 *
 * A token can be configured so that it reads nothing through a virtual
 * repository — its scope may not cover the virtual, or the account may lack
 * read access on the virtual parent or its members — or its stored repository
 * restriction may deny all repositories outright (`scope_error`). The row
 * carries a compact badge; the detail and remedy live behind it, fetched when
 * the popover opens so the list view costs nothing.
 */
export function TokenScopeWarning({
  accountId,
  tokenId,
  count,
  scopeError,
}: TokenScopeWarningProps) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["token-scope-analysis", accountId, tokenId],
    queryFn: () => serviceAccountsApi.getTokenScopeAnalysis(accountId, tokenId),
    enabled: open,
  });

  if (count <= 0 && !scopeError) return null;

  const groups = data ? groupByReason(data.unreachable) : [];
  const effectiveScopeError = data?.scope_error ?? scopeError;
  const triggerAriaLabel = scopeError
    ? SCOPE_ERROR_COPY[scopeError].ariaLabel
    : `${count} unreachable ${count === 1 ? "repository" : "repositories"}, show details`;
  const triggerText = scopeError
    ? SCOPE_ERROR_COPY[scopeError].badge
    : `${count} unreachable`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={triggerAriaLabel}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Badge
            variant="outline"
            className="gap-1 text-xs border-amber-500/50 text-amber-700 dark:text-amber-400"
          >
            <AlertTriangle className="size-3" />
            {triggerText}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm">
        {!isError && <p className="font-medium mb-2">This token cannot read</p>}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Checking...
          </div>
        )}
        {/* A failed check must never read as the all-clear next to a badge
            that says otherwise. */}
        {isError && (
          <p className="text-muted-foreground">Couldn&apos;t check this token. Try again later.</p>
        )}
        {!isLoading && !isError && effectiveScopeError && (
          <div className="mb-3 last:mb-0">
            <p className="text-xs font-medium">{SCOPE_ERROR_COPY[effectiveScopeError].label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {SCOPE_ERROR_COPY[effectiveScopeError].detail}
            </p>
          </div>
        )}
        {data && !effectiveScopeError && groups.length === 0 && (
          <p className="text-muted-foreground">Nothing — the token reaches every member.</p>
        )}
        {groups.map(({ reason, repoKeys }) => (
          <div key={reason} className="mb-3 last:mb-0">
            <p className="text-xs font-medium">{REASON_COPY[reason].label}</p>
            <ul className="my-1 space-y-0.5">
              {repoKeys.map((key) => (
                <li key={key} className="text-xs text-muted-foreground truncate" title={key}>
                  {key}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{REASON_COPY[reason].fix}</p>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The same finding at create time, under the selector preview — one line per
 * virtual repository naming the count and remedy.
 */
export function PreviewScopeWarning({ unreachable }: { readonly unreachable?: UnreachableVirtual[] }) {
  if (!unreachable || unreachable.length === 0) return null;

  const describe = (members: UnreachableMember[]) => {
    const reasons = new Set(members.map((m) => m.reason));
    if (reasons.size === 1) {
      const [only] = Array.from(reasons);
      return REASON_COPY[only].fix;
    }
    return "Some members are outside the token's scope and some lack read access on the virtual repository or member.";
  };

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs">
      {unreachable.map((virtualRepo) => (
        <div key={virtualRepo.virtual_repo_key} className="mb-2 last:mb-0">
          <p className="font-medium">
            <AlertTriangle className="inline size-3 mr-1 align-[-1px] text-amber-600 dark:text-amber-400" />
            {virtualRepo.virtual_repo_key}: {virtualRepo.members.length}{" "}
            {virtualRepo.members.length === 1 ? "member" : "members"} unreachable
          </p>
          <p className="text-muted-foreground">{describe(virtualRepo.members)}</p>
        </div>
      ))}
    </div>
  );
}
