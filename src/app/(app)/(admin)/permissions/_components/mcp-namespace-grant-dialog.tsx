"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { mcpApi } from "@/lib/api/mcp";
import { adminApi } from "@/lib/api/admin";
import { groupsApi } from "@/lib/api/groups";
import { serviceAccountsApi } from "@/lib/api/service-accounts";
import { validateNamespacePattern } from "@/lib/mcp/format";
import { mcpKeys } from "@/lib/mcp/query-keys";
import { mutationErrorToast } from "@/lib/error-utils";
import type { McpNamespaceGrant } from "@/types/mcp";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PrincipalType = McpNamespaceGrant["principal_type"];

export const MCP_PRINCIPAL_LABELS: Record<PrincipalType, string> = {
  user: "User",
  group: "Group",
  service_account: "Service Account",
};

/** Grantable MCP actions: publish, and status changes / deletes. */
export const MCP_GRANT_ACTIONS: { value: string; label: string }[] = [
  { value: "write", label: "write (publish)" },
  { value: "delete", label: "delete (edit status)" },
];

/**
 * Principal options for the picker, read through the same query keys as the
 * permissions page so the lists are shared from cache.
 */
function usePrincipalOptions(type: PrincipalType) {
  const users = useQuery({
    queryKey: ["admin-users", "principal-picker"],
    queryFn: () => adminApi.listUsers({ isServiceAccount: false, perPage: 100 }),
    enabled: type === "user",
  });
  const groups = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => groupsApi.list({ per_page: 1000 }),
    enabled: type === "group",
  });
  const accounts = useQuery({
    queryKey: ["service-accounts"],
    queryFn: () => serviceAccountsApi.list(),
    enabled: type === "service_account",
  });
  return useMemo(() => {
    if (type === "user") return (users.data ?? []).map((u) => ({ value: u.id, label: u.display_name || u.username }));
    if (type === "group") return (groups.data?.items ?? []).map((g) => ({ value: g.id, label: g.name }));
    return (accounts.data ?? []).map((a) => ({ value: a.id, label: a.display_name || a.username }));
  }, [type, users.data, groups.data, accounts.data]);
}

/** GitHub Actions' OIDC issuer, the usual source of `{repository_owner}`. */
export const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";

/** Whether a namespace pattern interpolates a CI OIDC claim. */
export function patternUsesClaim(pattern: string): boolean {
  return /\{[a-z0-9_]+\}/.test(pattern);
}

/** The issuer must be an absolute https URL (the `iss` of the provider's assertions). */
export function validateIssuer(issuer: string): string | null {
  const v = issuer.trim();
  if (!v) return "Enter the issuer of the CI OIDC tokens";
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? null : "The issuer is an https URL";
  } catch {
    return "The issuer is an https URL";
  }
}

interface Props {
  repoKey: string;
  /** The repository id the rule targets. */
  repositoryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function McpNamespaceGrantDialog({ repoKey, repositoryId, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <GrantForm repoKey={repoKey} repositoryId={repositoryId} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function GrantForm({ repoKey, repositoryId, onDone }: { repoKey: string; repositoryId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [principalType, setPrincipalType] = useState<PrincipalType>("user");
  const [principalId, setPrincipalId] = useState("");
  const [actions, setActions] = useState<string[]>(["write"]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [issuer, setIssuer] = useState(GITHUB_ACTIONS_ISSUER);
  const options = usePrincipalOptions(principalType);
  // `{claim}` patterns are bound to the issuer of the CI OIDC assertion
  // (`conditions.mcp_namespace_issuer`); the backend refuses them without one.
  const usesClaims = namespaces.some(patternUsesClaim);
  const issuerError = usesClaims ? validateIssuer(issuer) : null;

  const create = useMutation({
    mutationFn: () =>
      mcpApi.createNamespaceGrant(repositoryId, {
        principal_type: principalType,
        principal_id: principalId,
        actions,
        namespaces,
        issuer: usesClaims ? issuer.trim() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mcpKeys.all });
      toast.success("Namespace grant created");
      onDone();
    },
    onError: mutationErrorToast("Failed to create namespace grant"),
  });

  function addNamespace() {
    const ns = draft.trim();
    const error = validateNamespacePattern(ns);
    if (error) {
      setDraftError(error);
      return;
    }
    if (!namespaces.includes(ns)) setNamespaces([...namespaces, ns]);
    setDraft("");
    setDraftError(null);
  }

  const canSubmit =
    principalId !== "" && actions.length > 0 && namespaces.length > 0 && !issuerError && !create.isPending;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) create.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Create namespace grant</DialogTitle>
        <DialogDescription>
          Lets a principal publish or change servers under these namespaces in {repoKey}.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Principal type</Label>
          <Select
            value={principalType}
            onValueChange={(v) => {
              setPrincipalType(v as PrincipalType);
              setPrincipalId("");
            }}
          >
            <SelectTrigger className="w-full" aria-label="Principal type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MCP_PRINCIPAL_LABELS) as PrincipalType[]).map((t) => (
                <SelectItem key={t} value={t}>{MCP_PRINCIPAL_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Principal</Label>
          <Select value={principalId} onValueChange={setPrincipalId}>
            <SelectTrigger className="w-full" aria-label="Principal">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="max-w-[min(90vw,32rem)]">
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Actions</legend>
        <div className="flex flex-wrap gap-4">
          {MCP_GRANT_ACTIONS.map((a) => (
            <div key={a.value} className="flex items-center gap-2">
              <Checkbox
                id={`mcp-grant-${a.value}`}
                checked={actions.includes(a.value)}
                onCheckedChange={(c) =>
                  setActions(c === true ? [...actions, a.value] : actions.filter((x) => x !== a.value))
                }
              />
              <Label htmlFor={`mcp-grant-${a.value}`} className="text-sm">{a.label}</Label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="mcp-grant-ns">Namespaces</Label>
        <div className="flex gap-2">
          <Input
            id="mcp-grant-ns"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNamespace();
              }
            }}
            placeholder="io.github.{repository_owner}/*"
            autoComplete="off"
            aria-invalid={!!draftError}
            aria-describedby="mcp-grant-ns-help"
          />
          <Button type="button" variant="outline" onClick={addNamespace}>Add</Button>
        </div>
        <p id="mcp-grant-ns-help" className={`text-xs ${draftError ? "text-destructive" : "text-muted-foreground"}`}>
          {draftError ??
            "com.acme means com.acme/* (not com.acme.team or com.acmecorp). * matches anything, / included; {repository_owner} and other CI OIDC claims are filled in from the publishing token."}
        </p>
        {namespaces.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Namespaces to grant">
            {namespaces.map((ns) => (
              <li key={ns}>
                <Badge variant="secondary" className="gap-1 font-mono">
                  {ns}
                  <button
                    type="button"
                    aria-label={`Remove ${ns}`}
                    onClick={() => setNamespaces(namespaces.filter((x) => x !== ns))}
                    className="rounded-sm hover:text-destructive"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {usesClaims && (
        <div className="space-y-2">
          <Label htmlFor="mcp-grant-issuer">Claim issuer</Label>
          <Input
            id="mcp-grant-issuer"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            autoComplete="off"
            aria-invalid={!!issuerError}
            aria-describedby="mcp-grant-issuer-help"
          />
          <p id="mcp-grant-issuer-help" className={`text-xs ${issuerError ? "text-destructive" : "text-muted-foreground"}`}>
            {issuerError ??
              "A {claim} is filled in only from tokens exchanged for an OIDC assertion of this issuer (the CI provider's iss)."}
          </p>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={!canSubmit}>
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Create grant
        </Button>
      </DialogFooter>
    </form>
  );
}
