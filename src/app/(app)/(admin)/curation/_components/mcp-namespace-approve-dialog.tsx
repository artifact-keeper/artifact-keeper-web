"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { mcpApi } from "@/lib/api/mcp";
import { isBroadNamespaceGlob } from "@/lib/mcp/format";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { mutationErrorToast } from "@/lib/error-utils";
import type { McpBulkResult } from "@/types/mcp";

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

const PREVIEW_LIMIT = 10;

/** Client-side shape check of a full-name glob (the backend re-validates; a bare namespace is 422 there). */
export function validateNamespaceGlob(glob: string): string | null {
  const g = glob.trim();
  if (!g) return "Enter a full-name glob, e.g. io.github.acme/*";
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

type Action = "approve" | "block";

/** "Approved 4 servers; 1 refused by a deny glob; 2 flagged left for review". */
export function namespaceResultMessage(r: McpBulkResult, action: Action = "approve"): string {
  const parts = [action === "block" ? `Blocked ${plural(r.blocked, "server")}` : `Approved ${plural(r.approved, "server")}`];
  if (r.skippedDenied > 0) parts.push(`${r.skippedDenied} refused by a deny glob`);
  if (r.skippedReview > 0) parts.push(`${r.skippedReview} flagged left for review`);
  return parts.join("; ");
}

interface Props {
  repoKey: string;
  /** What the pattern does: approve pending names, or block every matching name. */
  action?: Action;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Approve or block by full-name glob (T14, approval-queue fatigue), through
 * `POST /catalog/bulk-approve|bulk-block`. The match list comes from the
 * backend's own dry run (`dryRun: true`), so the preview is exactly what the
 * confirmation does; confirming needs a preview of the current glob.
 * Approval is name-level, so every future version of a matched name flows
 * while the gates pass; the broad-glob warning exists because `io.github.*`
 * admits anyone with a GitHub account.
 */
export function McpNamespaceApproveDialog({ repoKey, action = "approve", open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <PatternBody key={action} repoKey={repoKey} action={action} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PatternBody({ repoKey, action, onDone }: { repoKey: string; action: Action; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [glob, setGlob] = useState("");
  const [reason, setReason] = useState("");
  const [includeReview, setIncludeReview] = useState(false);
  const g = glob.trim();
  const error = g ? validateNamespaceGlob(g) : null;
  const broad = g !== "" && !error && isBroadNamespaceGlob(g);
  const approve = action === "approve";
  const call = (dryRun: boolean) =>
    approve
      ? mcpApi.bulkApprovePattern(repoKey, { pattern: g, includeReview, reason: reason.trim() || undefined, dryRun })
      : mcpApi.bulkBlockPattern(repoKey, { pattern: g, reason: reason.trim() || undefined, dryRun });

  // The preview belongs to the glob (and include-review choice) it was made for.
  const previewKey = `${g}|${approve && includeReview}`;
  const [preview, setPreview] = useState<{ key: string; result: McpBulkResult } | null>(null);
  const current = preview?.key === previewKey ? preview.result : null;

  const dryRun = useMutation({
    mutationFn: () => call(true),
    onSuccess: (result) => setPreview({ key: previewKey, result }),
    onError: mutationErrorToast("Preview failed"),
  });
  const mutation = useMutation({
    mutationFn: () => call(false),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      toast.success(namespaceResultMessage(result, action));
      onDone();
    },
    onError: mutationErrorToast(approve ? "Namespace approval failed" : "Namespace block failed"),
  });
  const matched = current ? (approve ? current.approved : current.blocked) : 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{approve ? "Approve a namespace" : "Block a namespace"}</DialogTitle>
        <DialogDescription>
          {approve
            ? "Approves every pending server whose full name matches the glob. Approval is per name: later versions flow automatically while lint, scan and age gates pass. Deny globs always win, and lookalike names flagged for review are left alone unless you include them."
            : "Blocks every server whose full name matches the glob: blocked names are never served, whatever their version."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="mcp-ns-glob">Namespace glob</Label>
          <div className="flex gap-2">
            <Input
              id="mcp-ns-glob"
              value={glob}
              onChange={(e) => setGlob(e.target.value)}
              placeholder="io.github.acme/*"
              aria-invalid={!!error}
              aria-describedby="mcp-ns-glob-help"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!g || !!error || dryRun.isPending}
              onClick={() => dryRun.mutate()}
            >
              {dryRun.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Preview
            </Button>
          </div>
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
        {approve && (
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
        )}
        {current && (
          <div className="text-xs text-muted-foreground" aria-live="polite" data-testid="mcp-pattern-preview">
            <p>
              {approve ? "Would approve" : "Would block"} {plural(matched, "server")}
              {current.skippedDenied > 0 ? `; ${current.skippedDenied} refused by a deny glob` : ""}
              {current.skippedReview > 0 ? `; ${current.skippedReview} flagged left for review` : ""}.
            </p>
            {current.names.length > 0 && (
              <ul className="mt-1 list-inside list-disc font-mono">
                {current.names.slice(0, PREVIEW_LIMIT).map((n) => (
                  <li key={n}>{n}</li>
                ))}
                {current.names.length > PREVIEW_LIMIT && <li>and {current.names.length - PREVIEW_LIMIT} more</li>}
              </ul>
            )}
          </div>
        )}
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
          variant={approve ? "default" : "destructive"}
          disabled={!current || matched === 0 || reason.trim() === "" || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {approve ? "Approve namespace" : "Block namespace"}
        </Button>
      </DialogFooter>
    </>
  );
}
