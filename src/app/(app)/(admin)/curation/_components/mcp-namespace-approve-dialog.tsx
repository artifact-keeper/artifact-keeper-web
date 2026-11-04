"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { mcpApi } from "@/lib/api/mcp";
import { isBroadNamespaceGlob, mcpGlobMatches } from "@/lib/mcp/format";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { mutationErrorToast } from "@/lib/error-utils";
import type { McpBulkApproveResult } from "@/types/mcp";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { plural } from "./mcp-review-format";

const PREVIEW_LIMIT = 5;

/** Client-side shape check of a namespace glob (the backend re-validates). */
export function validateNamespaceGlob(glob: string): string | null {
  const g = glob.trim();
  if (!g) return "Enter a namespace glob, e.g. io.github.acme/*";
  // The backend's MAX_GLOB_LEN.
  if (g.length > 200) return "At most 200 characters";
  // The backend's glob alphabet: `*` is the only wildcard.
  if (!/^[A-Za-z0-9.\-_*/]+$/.test(g)) return "Use letters, digits, dots, hyphens, underscores, slashes and * only";
  if ((g.match(/\//g) ?? []).length > 1) return "A server name has exactly one slash";
  // The glob is matched against the full server name: a bare namespace
  // would match no name.
  if (!g.includes("/") && !g.includes("*")) return `Match the full name: write ${g}/* for this namespace's servers`;
  return null;
}

/** "Approved 4 servers; 1 refused by a deny glob; 2 flagged left for review". */
export function namespaceResultMessage(r: McpBulkApproveResult): string {
  const parts = [`Approved ${plural(r.approved, "server")}`];
  if (r.skippedDenied > 0) parts.push(`${r.skippedDenied} refused by a deny glob`);
  if (r.skippedReview > 0) parts.push(`${r.skippedReview} flagged left for review`);
  return parts.join("; ");
}

interface Props {
  repoKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names currently pending, for the match preview. */
  pendingNames: string[];
  /** Flagged (`review`) names, previewed when they are included. */
  reviewNames?: string[];
}

/**
 * Bulk approve by namespace glob (T14, approval-queue fatigue). Approval is
 * name-level, so every future version of a matched name flows while the
 * gates pass; the broad-glob warning exists because `io.github.*` admits
 * anyone with a GitHub account.
 */
export function McpNamespaceApproveDialog({ repoKey, open, onOpenChange, pendingNames, reviewNames = [] }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <NamespaceApproveBody
          repoKey={repoKey}
          pendingNames={pendingNames}
          reviewNames={reviewNames}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NamespaceApproveBody({
  repoKey,
  pendingNames,
  reviewNames = [],
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [glob, setGlob] = useState("");
  const [reason, setReason] = useState("");
  const [includeReview, setIncludeReview] = useState(false);
  const g = glob.trim();
  const error = g ? validateNamespaceGlob(g) : null;
  const broad = g !== "" && !error && isBroadNamespaceGlob(g);
  // The names a bulk approval takes: pending ones, plus flagged ones when included.
  const candidates = useMemo(
    () => (includeReview ? [...pendingNames, ...reviewNames] : pendingNames),
    [includeReview, pendingNames, reviewNames],
  );
  const matches = useMemo(
    () => (g && !error ? candidates.filter((n) => mcpGlobMatches(g, n)) : []),
    [g, error, candidates],
  );

  const mutation = useMutation({
    mutationFn: () => mcpApi.bulkApprovePattern(repoKey, { pattern: g, includeReview, reason: reason.trim() }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      toast.success(namespaceResultMessage(result));
      onDone();
    },
    onError: mutationErrorToast("Namespace approval failed"),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Approve a namespace</DialogTitle>
        <DialogDescription>
          Approves every pending server whose full name matches the glob.
          Approval is per name: later versions flow automatically while lint,
          scan and age gates pass. Deny globs always win, and lookalike names
          flagged for review are left alone unless you include them.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="mcp-ns-glob">Namespace glob</Label>
          <Input
            id="mcp-ns-glob"
            value={glob}
            onChange={(e) => setGlob(e.target.value)}
            placeholder="io.github.acme/*"
            aria-invalid={!!error}
            aria-describedby="mcp-ns-glob-help"
            autoComplete="off"
          />
          <p id="mcp-ns-glob-help" className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
            {error ?? "Matched against the full server name, ignoring case: * is any run of characters, including /."}
          </p>
        </div>
        {broad && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              This glob is broad: a wildcard in the namespace admits publishers
              you have not reviewed (anyone can claim an io.github.* namespace).
            </span>
          </div>
        )}
        {g && !error && (
          <div className="text-xs text-muted-foreground" aria-live="polite">
            <p>
              Matches {plural(matches.length, includeReview ? "pending or flagged server" : "pending server")}
              {candidates.length > 0 ? ` of ${candidates.length}` : ""}.
            </p>
            {matches.length > 0 && (
              <ul className="mt-1 list-inside list-disc font-mono">
                {matches.slice(0, PREVIEW_LIMIT).map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {matches.length > PREVIEW_LIMIT && <li>and {matches.length - PREVIEW_LIMIT} more</li>}
              </ul>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            id="mcp-ns-include-review"
            checked={includeReview}
            onCheckedChange={(v) => setIncludeReview(v === true)}
          />
          <Label htmlFor="mcp-ns-include-review" className="text-sm font-normal">
            Also approve flagged names (lookalikes awaiting review)
          </Label>
        </div>
        <Input
          placeholder="Reason (recorded in the audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason"
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          disabled={!g || !!error || reason.trim() === "" || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Approve namespace
        </Button>
      </DialogFooter>
    </>
  );
}
