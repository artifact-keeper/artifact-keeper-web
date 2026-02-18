"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Plus,
  Trash2,
  Pencil,
  Key,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { toast } from "sonner";

import { serviceAccountsApi } from "@/lib/api/service-accounts";
import type {
  ServiceAccount,
  ServiceAccountToken,
  CreateServiceAccountRequest,
  CreateTokenRequest,
  CreateTokenResponse,
  RepoSelector,
} from "@/lib/api/service-accounts";
import { useAuth } from "@/providers/auth-provider";
import { SCOPES } from "@/lib/constants/token";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { TokenCreatedAlert } from "@/components/common/token-created-alert";
import { TokenCreateForm } from "@/components/common/token-create-form";

function renderRepoAccess(t: ServiceAccountToken) {
  if (t.repo_selector) {
    const parts: string[] = [];
    if (t.repo_selector.match_formats?.length) {
      parts.push(`${t.repo_selector.match_formats.length} format(s)`);
    }
    if (t.repo_selector.match_pattern) {
      parts.push(t.repo_selector.match_pattern);
    }
    const labelCount = Object.keys(t.repo_selector.match_labels ?? {}).length;
    if (labelCount > 0) {
      parts.push(`${labelCount} label(s)`);
    }
    return (
      <Badge variant="secondary" className="text-xs">
        {parts.join(", ") || "Selector"}
      </Badge>
    );
  }
  if (t.repository_ids?.length > 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        {t.repository_ids.length} repo(s)
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">All repos</span>
  );
}

export default function ServiceAccountsPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<ServiceAccount | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState<ServiceAccount | null>(
    null
  );

  // Token management dialog
  const [tokenAccount, setTokenAccount] = useState<ServiceAccount | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("90");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read"]);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(
    null
  );
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);
  const [tokenRepoSelector, setTokenRepoSelector] = useState<RepoSelector>({});

  // Queries
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["service-accounts"],
    queryFn: () => serviceAccountsApi.list(),
    enabled: !!currentUser?.is_admin,
  });

  const { data: tokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ["service-account-tokens", tokenAccount?.id],
    queryFn: () =>
      tokenAccount ? serviceAccountsApi.listTokens(tokenAccount.id) : [],
    enabled: !!tokenAccount,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (req: CreateServiceAccountRequest) =>
      serviceAccountsApi.create(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      toast.success("Service account created");
    },
    onError: () => toast.error("Failed to create service account"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      display_name,
      is_active,
    }: {
      id: string;
      display_name?: string;
      is_active?: boolean;
    }) => serviceAccountsApi.update(id, { display_name, is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setEditOpen(false);
      setEditAccount(null);
      toast.success("Service account updated");
    },
    onError: () => toast.error("Failed to update service account"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serviceAccountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setDeleteOpen(false);
      setDeleteAccount(null);
      toast.success("Service account deleted");
    },
    onError: () => toast.error("Failed to delete service account"),
  });

  const createTokenMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: CreateTokenRequest }) =>
      serviceAccountsApi.createToken(id, req),
    onSuccess: (result: CreateTokenResponse) => {
      queryClient.invalidateQueries({
        queryKey: ["service-account-tokens", tokenAccount?.id],
      });
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setNewlyCreatedToken(result.token);
      setTokenName("");
      setTokenScopes(["read"]);
      setTokenExpiry("90");
      setTokenRepoSelector({});
      toast.success("Token created");
    },
    onError: () => toast.error("Failed to create token"),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: ({ accountId, tokenId }: { accountId: string; tokenId: string }) =>
      serviceAccountsApi.revokeToken(accountId, tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-account-tokens", tokenAccount?.id],
      });
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setRevokeTokenId(null);
      toast.success("Token revoked");
    },
    onError: () => toast.error("Failed to revoke token"),
  });

  // Handlers
  const handleEdit = useCallback((account: ServiceAccount) => {
    setEditAccount(account);
    setEditDisplayName(account.display_name ?? "");
    setEditOpen(true);
  }, []);

  const handleManageTokens = useCallback((account: ServiceAccount) => {
    setTokenAccount(account);
    setTokenDialogOpen(true);
  }, []);

  if (!currentUser?.is_admin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You need admin privileges to manage service accounts.
        </AlertDescription>
      </Alert>
    );
  }

  // Columns
  const columns: DataTableColumn<ServiceAccount>[] = [
    {
      id: "username",
      header: "Username",
      accessor: (a) => a.username,
      sortable: true,
      cell: (a) => (
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{a.username}</span>
        </div>
      ),
    },
    {
      id: "display_name",
      header: "Description",
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {a.display_name || "-"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (a) => (
        <StatusBadge
          status={a.is_active ? "Active" : "Inactive"}
          color={a.is_active ? "green" : "red"}
        />
      ),
    },
    {
      id: "tokens",
      header: "Tokens",
      accessor: (a) => a.token_count,
      cell: (a) => (
        <Badge variant="secondary" className="text-xs">
          {a.token_count}
        </Badge>
      ),
    },
    {
      id: "created",
      header: "Created",
      accessor: (a) => a.created_at,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {new Date(a.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (a) => (
        <div className="flex items-center gap-1 justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleManageTokens(a)}
              >
                <Key className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Manage Tokens</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleEdit(a)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  updateMutation.mutate({
                    id: a.id,
                    is_active: !a.is_active,
                  })
                }
              >
                {a.is_active ? (
                  <ToggleRight className="size-3.5" />
                ) : (
                  <ToggleLeft className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {a.is_active ? "Deactivate" : "Activate"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setDeleteAccount(a);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // Token columns for the manage dialog
  const tokenColumns: DataTableColumn<ServiceAccountToken>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (t) => t.name,
      cell: (t) => (
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{t.name}</span>
          {t.is_expired && (
            <Badge variant="destructive" className="text-xs">
              Expired
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "prefix",
      header: "Prefix",
      cell: (t) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {t.token_prefix}...
        </code>
      ),
    },
    {
      id: "scopes",
      header: "Scopes",
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.scopes.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "repo_access",
      header: "Repo Access",
      cell: renderRepoAccess,
    },
    {
      id: "last_used",
      header: "Last Used",
      cell: (t) =>
        t.last_used_at ? (
          <span className="text-sm text-muted-foreground">
            {new Date(t.last_used_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Never</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: (t) => (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevokeTokenId(t.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Revoke</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Accounts"
        description="Machine identities for CI/CD pipelines and automated systems. Each service account can have its own API tokens, independent of any human user."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create Service Account
          </Button>
        }
      />

      {accounts.length === 0 && !isLoading ? (
        <EmptyState
          icon={Bot}
          title="No service accounts"
          description="Create a service account to give CI/CD pipelines and automated systems their own identity and API tokens."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create Service Account
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={accounts}
          loading={isLoading}
          rowKey={(a) => a.id}
          emptyMessage="No service accounts found."
        />
      )}

      {/* Create Service Account Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setCreateName("");
            setCreateDescription("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Service Account</DialogTitle>
            <DialogDescription>
              Service accounts are machine identities. The username will be
              prefixed with &quot;svc-&quot; automatically.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name: createName,
                description: createDescription || undefined,
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="svc-name">Name</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">svc-</span>
                <Input
                  id="svc-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="deploy-pipeline"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Alphanumeric characters and hyphens only.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-description">Description</Label>
              <Input
                id="svc-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Production deployment pipeline"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !createName}
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Service Account Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditAccount(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit: {editAccount?.username}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (editAccount) {
                updateMutation.mutate({
                  id: editAccount.id,
                  display_name: editDisplayName || undefined,
                });
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-display-name">Description</Label>
              <Input
                id="edit-display-name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Description for this service account"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage Tokens Dialog */}
      <Dialog
        open={tokenDialogOpen}
        onOpenChange={(o) => {
          setTokenDialogOpen(o);
          if (!o) {
            setTokenAccount(null);
            setCreateTokenOpen(false);
            setNewlyCreatedToken(null);
            setTokenRepoSelector({});
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Tokens: {tokenAccount?.username}
            </DialogTitle>
            <DialogDescription>
              Manage API tokens for this service account.
            </DialogDescription>
          </DialogHeader>

          {newlyCreatedToken ? (
            <TokenCreatedAlert
              title="Token Created"
              description="Copy this token now. You will not be able to see it again."
              token={newlyCreatedToken}
              onDone={() => setNewlyCreatedToken(null)}
            />
          ) : createTokenOpen ? (
            <TokenCreateForm
              title="Create Token"
              description="Generate a new API token for this service account."
              name={tokenName}
              onNameChange={setTokenName}
              namePlaceholder="e.g., production-deploy"
              expiry={tokenExpiry}
              onExpiryChange={setTokenExpiry}
              scopes={tokenScopes}
              onScopesChange={setTokenScopes}
              availableScopes={SCOPES}
              isPending={createTokenMutation.isPending}
              onSubmit={() => {
                if (tokenAccount) {
                  const hasSelector =
                    (tokenRepoSelector.match_formats?.length ?? 0) > 0 ||
                    Object.keys(tokenRepoSelector.match_labels ?? {}).length > 0 ||
                    !!tokenRepoSelector.match_pattern;
                  createTokenMutation.mutate({
                    id: tokenAccount.id,
                    req: {
                      name: tokenName,
                      scopes: tokenScopes,
                      expires_in_days:
                        tokenExpiry === "0" ? undefined : Number(tokenExpiry),
                      repo_selector: hasSelector ? tokenRepoSelector : undefined,
                    },
                  });
                }
              }}
              onCancel={() => setCreateTokenOpen(false)}
              submitLabel="Create Token"
              showRepoSelector
              repoSelector={tokenRepoSelector}
              onRepoSelectorChange={setTokenRepoSelector}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setCreateTokenOpen(true)}
                >
                  <Plus className="size-4" />
                  Create Token
                </Button>
              </div>

              {tokens.length === 0 && !tokensLoading ? (
                <EmptyState
                  icon={Key}
                  title="No tokens"
                  description="Create a token for this service account."
                  action={
                    <Button
                      size="sm"
                      onClick={() => setCreateTokenOpen(true)}
                    >
                      <Plus className="size-4" />
                      Create Token
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  columns={tokenColumns}
                  data={tokens}
                  loading={tokensLoading}
                  rowKey={(t) => t.id}
                  emptyMessage="No tokens found."
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Service Account Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteOpen(false);
            setDeleteAccount(null);
          }
        }}
        title="Delete Service Account"
        description={`This will permanently delete "${deleteAccount?.username}" and revoke all its tokens. Any pipelines using those tokens will lose access immediately.`}
        confirmText="Delete"
        typeToConfirm={deleteAccount?.username}
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteAccount) deleteMutation.mutate(deleteAccount.id);
        }}
      />

      {/* Revoke Token Confirm */}
      <ConfirmDialog
        open={!!revokeTokenId}
        onOpenChange={(o) => {
          if (!o) setRevokeTokenId(null);
        }}
        title="Revoke Token"
        description="This will permanently invalidate this token. Any systems using it will lose access immediately."
        confirmText="Revoke"
        danger
        loading={revokeTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenId && tokenAccount) {
            revokeTokenMutation.mutate({
              accountId: tokenAccount.id,
              tokenId: revokeTokenId,
            });
          }
        }}
      />
    </div>
  );
}
