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
import { useTranslations } from "next-intl";

import { serviceAccountsApi } from "@/lib/api/service-accounts";
import { mutationErrorToast } from "@/lib/error-utils";
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

function renderRepoAccess(
  token: ServiceAccountToken,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  if (token.repo_selector) {
    const parts: string[] = [];
    if (token.repo_selector.match_formats?.length) {
      parts.push(
        `${token.repo_selector.match_formats.length} ${t("formatCount", {
          count: token.repo_selector.match_formats.length,
        })}`
      );
    }
    if (token.repo_selector.match_pattern) {
      parts.push(token.repo_selector.match_pattern);
    }
    const labelCount = Object.keys(token.repo_selector.match_labels ?? {}).length;
    if (labelCount > 0) {
      parts.push(`${labelCount} ${t("labelCount", { count: labelCount })}`);
    }
    return (
      <Badge variant="secondary" className="text-xs">
        {parts.join(", ") || t("selector")}
      </Badge>
    );
  }
  if (token.repository_ids?.length > 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        {token.repository_ids.length} {t("repoCount", {
          count: token.repository_ids.length,
        })}
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">{t("allRepos")}</span>
  );
}

export default function ServiceAccountsPage() {
  const t = useTranslations("app/admin/service-accounts");
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
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read:artifacts"]);
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
      toast.success(t("created"));
    },
    onError: mutationErrorToast(t("createdError")),
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
      toast.success(t("updated"));
    },
    onError: mutationErrorToast(t("updatedError")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serviceAccountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-accounts"] });
      setDeleteOpen(false);
      setDeleteAccount(null);
      toast.success(t("deleted"));
    },
    onError: mutationErrorToast(t("deletedError")),
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
      setTokenScopes(["read:artifacts"]);
      setTokenExpiry("90");
      setTokenRepoSelector({});
      toast.success(t("tokenCreated"));
    },
    onError: mutationErrorToast(t("tokenCreatedError")),
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
      toast.success(t("tokenRevoked"));
    },
    onError: mutationErrorToast(t("tokenRevokedError")),
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
        <AlertTitle>{t("accessDenied")}</AlertTitle>
        <AlertDescription>
          {t("accessDeniedDescription")}
        </AlertDescription>
      </Alert>
    );
  }

  // Columns
  const columns: DataTableColumn<ServiceAccount>[] = [
    {
      id: "username",
      header: t("colUsername"),
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
      header: t("colDescription"),
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {a.display_name || "-"}
        </span>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      cell: (a) => (
        <StatusBadge
          status={a.is_active ? t("active") : t("inactive")}
          color={a.is_active ? "green" : "red"}
        />
      ),
    },
    {
      id: "tokens",
      header: t("colTokens"),
      accessor: (a) => a.token_count,
      cell: (a) => (
        <Badge variant="secondary" className="text-xs">
          {a.token_count}
        </Badge>
      ),
    },
    {
      id: "created",
      header: t("colCreated"),
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
            <TooltipContent>{t("manageTokens")}</TooltipContent>
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
            <TooltipContent>{t("edit")}</TooltipContent>
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
              {a.is_active ? t("deactivate") : t("activate")}
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
            <TooltipContent>{t("delete")}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  // Token columns for the manage dialog
  const tokenColumns: DataTableColumn<ServiceAccountToken>[] = [
    {
      id: "name",
      header: t("colName"),
      accessor: (tok) => tok.name,
      cell: (tok) => (
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{tok.name}</span>
          {tok.is_expired && (
            <Badge variant="destructive" className="text-xs">
              {t("expired")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "prefix",
      header: t("colPrefix"),
      cell: (tok) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {tok.token_prefix}...
        </code>
      ),
    },
    {
      id: "scopes",
      header: t("colScopes"),
      cell: (tok) => (
        <div className="flex flex-wrap gap-1">
          {tok.scopes.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "repo_access",
      header: t("colRepoAccess"),
      cell: (row) => renderRepoAccess(row, t),
    },
    {
      id: "last_used",
      header: t("colLastUsed"),
      cell: (tok) =>
        tok.last_used_at ? (
          <span className="text-sm text-muted-foreground">
            {new Date(tok.last_used_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{t("never")}</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: (tok) => (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevokeTokenId(tok.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("revoke")}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t("create")}
          </Button>
        }
      />

      {accounts.length === 0 && !isLoading ? (
        <EmptyState
          icon={Bot}
          title={t("noAccounts")}
          description={t("noAccountsDescription")}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("create")}
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={accounts}
          loading={isLoading}
          rowKey={(a) => a.id}
          emptyMessage={t("noAccountsFound")}
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
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("createDialogDescription")}
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
              <Label htmlFor="svc-name">{t("name")}</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">svc-</span>
                <Input
                  id="svc-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("nameHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="svc-description">{t("descriptionLabel")}</Label>
              <Input
                id="svc-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !createName}
              >
                {createMutation.isPending ? t("creating") : t("create")}
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
              {t("editDialogTitle", { username: editAccount?.username ?? "" })}
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
              <Label htmlFor="edit-display-name">{t("descriptionLabel")}</Label>
              <Input
                id="edit-display-name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder={t("editDescriptionPlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setEditOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("saving") : t("save")}
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
              {t("tokensDialogTitle", {
                username: tokenAccount?.username ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("tokensDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          {newlyCreatedToken ? (
            <TokenCreatedAlert
              title={t("tokenCreatedTitle")}
              description={t("tokenCreatedDescription")}
              token={newlyCreatedToken}
              onDone={() => setNewlyCreatedToken(null)}
            />
          ) : createTokenOpen ? (
            <TokenCreateForm
              title={t("createToken")}
              description={t("createTokenDescription")}
              name={tokenName}
              onNameChange={setTokenName}
              namePlaceholder={t("tokenNamePlaceholder")}
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
              submitLabel={t("createToken")}
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
                  {t("createToken")}
                </Button>
              </div>

              {tokens.length === 0 && !tokensLoading ? (
                <EmptyState
                  icon={Key}
                  title={t("noTokens")}
                  description={t("noTokensDescription")}
                  action={
                    <Button
                      size="sm"
                      onClick={() => setCreateTokenOpen(true)}
                    >
                      <Plus className="size-4" />
                      {t("createToken")}
                    </Button>
                  }
                />
              ) : (
                <DataTable
                  columns={tokenColumns}
                  data={tokens}
                  loading={tokensLoading}
                  rowKey={(tok) => tok.id}
                  emptyMessage={t("noTokensFound")}
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
        title={t("deleteTitle")}
        description={t("deleteDescription", {
          username: deleteAccount?.username ?? "",
        })}
        confirmText={t("delete")}
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
        title={t("revokeTitle")}
        description={t("revokeDescription")}
        confirmText={t("revoke")}
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
