"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { mcpApi } from "@/lib/api/mcp";
import { isHostedMcpRepo } from "@/lib/mcp/format";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types";
import type { McpNamespaceGrant } from "@/types/mcp";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { MCP_PRINCIPAL_LABELS, McpNamespaceGrantDialog } from "./mcp-namespace-grant-dialog";

/**
 * Namespace-conditioned grants on hosted MCP repositories: ordinary
 * permission rules (`/api/v1/permissions`) whose `conditions.mcp_namespaces`
 * limits an MCP write to matching server names (artifact-keeper#5253).
 * Shown on the permissions page when the instance has a hosted MCP
 * repository on a backend that knows the condition (it echoes
 * `mcp_require_namespace_grant`); `?mcp=<repoKey>` preselects one.
 * Admin-only, like the page that hosts it.
 */
export function McpNamespaceGrants({ repositories }: { repositories: Repository[] }) {
  const deepLinkKey = useSearchParams()?.get("mcp") ?? "";
  // A backend without namespace conditions would store the rule unconditioned,
  // so the section needs the setting the same backend echoes.
  const mcpRepos = repositories.filter((r) => isHostedMcpRepo(r) && r.mcp_require_namespace_grant !== undefined);
  const [picked, setPicked] = useState("");
  const repoKey =
    picked || mcpRepos.find((r) => r.key === deepLinkKey)?.key || mcpRepos[0]?.key || "";
  const repo = mcpRepos.find((r) => r.key === repoKey);

  const grants = useQuery({
    queryKey: mcpKeys.grants(repoKey),
    queryFn: () => mcpApi.listNamespaceGrants(repo!.id),
    enabled: !!repo,
  });

  if (!repo) {
    // Only say so when someone came here for it; otherwise stay out of the way.
    return deepLinkKey ? (
      <p className="text-sm text-muted-foreground">MCP namespace grants are not available on this server.</p>
    ) : null;
  }

  return (
    <section id="mcp-namespace-grants" aria-labelledby="mcp-namespace-grants-title" className="space-y-4 rounded-lg border p-4">
      <GrantsHeader repos={mcpRepos} repo={repo} onPick={setPicked} />
      {grants.isLoading ? (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : grants.isError ? (
        <p role="alert" className="text-sm text-destructive">Couldn&apos;t load the namespace grants.</p>
      ) : (
        <GrantsTable repoKey={repo.key} grants={grants.data ?? []} />
      )}
    </section>
  );
}

function GrantsHeader({
  repos,
  repo,
  onPick,
}: {
  repos: Repository[];
  repo: Repository;
  onPick: (key: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const required = repo.mcp_require_namespace_grant === true;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="mcp-namespace-grants-title" className="text-base font-semibold">MCP namespace grants</h2>
        <Select value={repo.key} onValueChange={onPick}>
          <SelectTrigger className="w-56" aria-label="MCP repository">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {repos.map((r) => (
              <SelectItem key={r.id} value={r.key}>{r.key}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant={required ? "secondary" : "outline"}>
          {required ? "Required on this repository" : "Not required on this repository"}
        </Badge>
        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Create grant
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        A grant limits who may publish under a namespace. It only matters when
        the repository requires namespace grants (mcp_require_namespace_grant);
        otherwise repository write access is enough to publish any allowed name.
      </p>
      <McpNamespaceGrantDialog repoKey={repo.key} repositoryId={repo.id} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function GrantsTable({ repoKey, grants }: { repoKey: string; grants: McpNamespaceGrant[] }) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<McpNamespaceGrant | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => mcpApi.deleteNamespaceGrant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      toast.success("Namespace grant deleted");
      setPendingDelete(null);
    },
    onError: mutationErrorToast("Failed to delete namespace grant"),
  });

  if (grants.length === 0) {
    return (
      <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
        No namespace grants on {repoKey}.
      </p>
    );
  }
  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Principal</th>
              <th className="px-3 py-2 font-medium">Actions</th>
              <th className="px-3 py-2 font-medium">Namespaces</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {grants.map((g) => {
              const who = g.principal_name ?? g.principal_id;
              return (
                <tr key={g.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{MCP_PRINCIPAL_LABELS[g.principal_type] ?? g.principal_type}</Badge>
                      <span className="font-medium">{who}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{g.actions.join(", ")}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {g.namespaces.map((ns) => (
                        <Badge key={ns} variant="secondary" className="font-mono">{ns}</Badge>
                      ))}
                    </div>
                    {g.issuer && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Claims from <span className="font-mono">{g.issuer}</span>
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete grant for ${who}`}
                      onClick={() => setPendingDelete(g)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Delete namespace grant"
        description="The principal loses the right to publish under these namespaces when the repository requires namespace grants."
        confirmText="Delete grant"
        danger
        loading={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </>
  );
}
