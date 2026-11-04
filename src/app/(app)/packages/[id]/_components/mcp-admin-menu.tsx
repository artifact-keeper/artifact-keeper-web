"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { mcpApi, mcpProblemMessage } from "@/lib/api/mcp";
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
 * Admin actions on one server version. Status changes go through the
 * registry's own `PATCH .../status` so they behave exactly as
 * `mcp-publisher status` would; `active` takes no message (the registry
 * clears it).
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
  probeAvailable,
}: {
  repoKey: string;
  name: string;
  version: string;
  status?: McpServerStatus;
  isRemote: boolean;
  probeAvailable: boolean;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<McpServerStatus | null>(null);
  const [message, setMessage] = useState("");

  const setStatus = useMutation({
    mutationFn: (s: McpServerStatus) =>
      mcpApi.setVersionStatus(repoKey, name, version, s, s === "active" ? undefined : message.trim() || undefined),
    onSuccess: (_d, s) => {
      toast.success(ACTION_TEXT[s].done);
      setTarget(null);
      setMessage("");
      qc.invalidateQueries({ queryKey: mcpKeys.all });
    },
    onError: (err) => toast.error(mcpProblemMessage(err) ?? "Status change failed"),
  });

  const probe = useMutation({
    mutationFn: () => mcpApi.probe(repoKey, name, version),
    onSuccess: () => {
      toast.success("Probe queued");
      qc.invalidateQueries({ queryKey: mcpKeys.capabilities(repoKey, name, version) });
    },
    onError: (err) => toast.error(mcpProblemMessage(err) ?? "Probe failed"),
  });

  const choices: McpServerStatus[] = (["deprecated", "active", "deleted"] as const).filter((s) => s !== status);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Admin actions">
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
          {(isRemote || probeAvailable) && <DropdownMenuSeparator />}
          {isRemote && (
            <DropdownMenuItem asChild>
              <Link href={`/curation?repo=${encodeURIComponent(repoKey)}`}>Open in curation queue</Link>
            </DropdownMenuItem>
          )}
          {probeAvailable && <DropdownMenuItem onSelect={() => probe.mutate()}>Re-probe tools</DropdownMenuItem>}
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
