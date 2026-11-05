"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { mcpApi, mcpProblemMessage, mcpWriteRefusal } from "@/lib/api/mcp";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { McpServerStatus } from "@/types/mcp";

/**
 * Actions on one server version. Status changes and the soft delete need
 * only repository `write` (plus a namespace grant under
 * `mcp_require_namespace_grant`), never repository administration, so they
 * are offered to every signed-in caller and the backend's refusal is shown;
 * only the curation link and re-probe need `isRepoAdmin`. Deprecate and
 * Mark active go through the registry's `PATCH .../status` (as
 * `mcp-publisher status` would; `active` takes no message, the registry
 * clears it); Delete version is the registry's own soft delete,
 * `DELETE .../versions/{version}`.
 *
 * A Remote or Virtual registry accepts no write from anyone (the backend
 * answers `405 mcp_read_only`), so `readOnly` drops the status and delete
 * items there; the menu then holds only the admin items, and is not drawn
 * when it would be empty.
 */

export const MCP_STATUS_MESSAGE_MAX = 500;

const ACTION_TEXT: Record<McpServerStatus, { item: string; title: string; done: string }> = {
  deprecated: { item: "Deprecate", title: "Deprecate this version", done: "Version deprecated" },
  active: { item: "Mark active", title: "Mark this version active", done: "Version marked active" },
  deleted: { item: "Delete version", title: "Delete this version", done: "Version deleted" },
};

export function McpAdminMenu({
  repoKey,
  name,
  version,
  status,
  isRemote,
  readOnly,
  probeAvailable,
  isRepoAdmin,
}: {
  repoKey: string;
  name: string;
  version: string;
  status?: McpServerStatus;
  isRemote: boolean;
  /** Remote or Virtual repository (or its type not known yet): no version writes. */
  readOnly: boolean;
  probeAvailable: boolean;
  /** Repository administration (`mcp_caller_is_repo_admin` or instance admin). */
  isRepoAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<McpServerStatus | null>(null);
  const [message, setMessage] = useState("");

  const setStatus = useMutation({
    mutationFn: (s: McpServerStatus) => {
      const msg = s === "active" ? undefined : message.trim() || undefined;
      return s === "deleted"
        ? mcpApi.deleteVersion(repoKey, name, version, msg)
        : mcpApi.setVersionStatus(repoKey, name, version, s, msg);
    },
    onSuccess: (_d, s) => {
      toast.success(ACTION_TEXT[s].done);
      setTarget(null);
      setMessage("");
      qc.invalidateQueries({ queryKey: mcpKeys.all });
    },
    onError: (err) => toast.error(mcpWriteRefusal(err) ?? mcpProblemMessage(err) ?? "Status change failed"),
  });

  const probe = useMutation({
    mutationFn: () => mcpApi.probe(repoKey, name, version),
    onSuccess: () => {
      toast.success("Probe queued");
      qc.invalidateQueries({ queryKey: mcpKeys.capabilities(repoKey, name, version) });
    },
    onError: (err) => toast.error(mcpProblemMessage(err) ?? "Probe failed"),
  });

  const showCuration = isRepoAdmin && isRemote;
  const showProbe = isRepoAdmin && probeAvailable;
  const choices: McpServerStatus[] = readOnly
    ? []
    : (["deprecated", "active", "deleted"] as const).filter((s) => s !== status);
  if (choices.length === 0 && !showCuration && !showProbe) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Version actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {choices.map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => setTarget(s)}
              className={s === "deleted" ? "text-destructive focus:text-destructive" : undefined}
            >
              {ACTION_TEXT[s].item}
            </DropdownMenuItem>
          ))}
          {choices.length > 0 && (showCuration || showProbe) && <DropdownMenuSeparator />}
          {showCuration && (
            <DropdownMenuItem asChild>
              <Link href={`/curation?repo=${encodeURIComponent(repoKey)}`}>Open in curation queue</Link>
            </DropdownMenuItem>
          )}
          {showProbe && <DropdownMenuItem onSelect={() => probe.mutate()}>Re-probe tools</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          {target && (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_TEXT[target].title}</DialogTitle>
                <DialogDescription>
                  {name} {version}
                  {target === "deleted" ? ": clients stop seeing it; an administrator can mark it active again." : ""}
                </DialogDescription>
              </DialogHeader>
              {target !== "active" && (
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-status-message">Reason (optional, shown to clients)</Label>
                  <Textarea
                    id="mcp-status-message"
                    value={message}
                    maxLength={MCP_STATUS_MESSAGE_MAX}
                    onChange={(e) => setMessage(e.target.value.slice(0, MCP_STATUS_MESSAGE_MAX))}
                  />
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {message.length}/{MCP_STATUS_MESSAGE_MAX}
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant={target === "deleted" ? "destructive" : "default"}
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate(target)}
                >
                  {ACTION_TEXT[target].item}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
