"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key,
  Shield,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { profileApi } from "@/lib/api/profile";
import { mutationErrorToast } from "@/lib/error-utils";
import type {
  ApiKey,
  AccessToken,
  CreateApiKeyRequest,
  CreateAccessTokenRequest,
  CreateApiKeyResponse,
  CreateAccessTokenResponse,
} from "@/lib/api/profile";
import type { RepoSelector } from "@/lib/api/service-accounts";
import { useAuth } from "@/providers/auth-provider";
import { SCOPES } from "@/lib/constants/token";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { TokenCreatedAlert } from "@/components/common/token-created-alert";
import { TokenCreateForm } from "@/components/common/token-create-form";

function DateCell({ value }: { value?: string | null }) {
  const t = useTranslations("app/protected/access-tokens");
  if (!value) return <span className="text-sm text-muted-foreground">{t("never")}</span>;
  return (
    <span className="text-sm text-muted-foreground">
      {new Date(value).toLocaleDateString()}
    </span>
  );
}

function ScopeBadges({ scopes }: { scopes?: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(scopes ?? []).map((s) => (
        <Badge key={s} variant="secondary" className="text-xs">
          {s}
        </Badge>
      ))}
    </div>
  );
}

function TokenPrefix({ prefix }: { prefix: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
      {prefix}...
    </code>
  );
}

export function renderRepoAccess(
  token: AccessToken,
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
  if (token.repository_ids && token.repository_ids.length > 0) {
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

export default function AccessTokensPage() {
  const t = useTranslations("app/protected/access-tokens");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const availableScopes = SCOPES.filter(
    (s) => s.value !== "admin" || user?.is_admin
  );

  // API Key state
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyExpiry, setKeyExpiry] = useState("90");
  const [keyScopes, setKeyScopes] = useState<string[]>(["read:artifacts"]);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);

  // Access Token state
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("90");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read:artifacts"]);
  const [tokenRepoSelector, setTokenRepoSelector] = useState<RepoSelector>({});
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(
    null
  );
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);

  // Queries
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["profile", "api-keys"],
    queryFn: () => profileApi.listApiKeys(),
  });

  const { data: accessTokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ["profile", "access-tokens"],
    queryFn: () => profileApi.listAccessTokens(),
  });

  // Mutations
  const createKeyMutation = useMutation({
    mutationFn: (data: CreateApiKeyRequest) => profileApi.createApiKey(data),
    onSuccess: (result: CreateApiKeyResponse) => {
      queryClient.invalidateQueries({ queryKey: ["profile", "api-keys"] });
      setNewlyCreatedKey(result.token);
      setKeyName("");
      setKeyScopes(["read:artifacts"]);
      setKeyExpiry("90");
      toast.success(t("apiKeyCreated"));
    },
    onError: mutationErrorToast(t("apiKeyCreatedError")),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => profileApi.deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "api-keys"] });
      setRevokeKeyId(null);
      toast.success(t("apiKeyRevoked"));
    },
    onError: mutationErrorToast(t("apiKeyRevokedError")),
  });

  const createTokenMutation = useMutation({
    mutationFn: (data: CreateAccessTokenRequest) =>
      profileApi.createAccessToken(data),
    onSuccess: (result: CreateAccessTokenResponse) => {
      queryClient.invalidateQueries({
        queryKey: ["profile", "access-tokens"],
      });
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
    mutationFn: (id: string) => profileApi.deleteAccessToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["profile", "access-tokens"],
      });
      setRevokeTokenId(null);
      toast.success(t("tokenRevoked"));
    },
    onError: mutationErrorToast(t("tokenRevokedError")),
  });

  // Column definitions
  const keyColumns: DataTableColumn<ApiKey>[] = [
    {
      id: "name",
      header: t("colName"),
      accessor: (k) => k.name,
      sortable: true,
      cell: (k) => (
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{k.name}</span>
        </div>
      ),
    },
    { id: "prefix", header: t("colKeyPrefix"), cell: (k) => <TokenPrefix prefix={k.key_prefix} /> },
    { id: "scopes", header: t("colScopes"), cell: (k) => <ScopeBadges scopes={k.scopes} /> },
    { id: "expires", header: t("colExpires"), accessor: (k) => k.expires_at ?? "", cell: (k) => <DateCell value={k.expires_at} /> },
    { id: "last_used", header: t("colLastUsed"), accessor: (k) => k.last_used_at ?? "", cell: (k) => <DateCell value={k.last_used_at} /> },
    { id: "created", header: t("colCreated"), accessor: (k) => k.created_at, sortable: true, cell: (k) => <DateCell value={k.created_at} /> },
    {
      id: "actions",
      header: "",
      cell: (k) => (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setRevokeKeyId(k.id)}
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

  const tokenColumns: DataTableColumn<AccessToken>[] = [
    {
      id: "name",
      header: t("colName"),
      accessor: (tok) => tok.name,
      sortable: true,
      cell: (tok) => (
        <div className="flex items-center gap-2">
          <Shield className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{tok.name}</span>
        </div>
      ),
    },
    { id: "prefix", header: t("colTokenPrefix"), cell: (tok) => <TokenPrefix prefix={tok.token_prefix} /> },
    { id: "scopes", header: t("colScopes"), cell: (tok) => <ScopeBadges scopes={tok.scopes} /> },
    { id: "repo_access", header: t("colRepoAccess"), cell: (row) => renderRepoAccess(row, t) },
    { id: "expires", header: t("colExpires"), accessor: (tok) => tok.expires_at ?? "", cell: (tok) => <DateCell value={tok.expires_at} /> },
    { id: "last_used", header: t("colLastUsed"), accessor: (tok) => tok.last_used_at ?? "", cell: (tok) => <DateCell value={tok.last_used_at} /> },
    { id: "created", header: t("colCreated"), accessor: (tok) => tok.created_at, sortable: true, cell: (tok) => <DateCell value={tok.created_at} /> },
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
      />

      <Tabs defaultValue="api-keys">
        <TabsList>
          <TabsTrigger value="api-keys">
            <Key className="size-4" />
            {t("tabApiKeys")}
          </TabsTrigger>
          <TabsTrigger value="access-tokens">
            <Shield className="size-4" />
            {t("tabAccessTokens")}
          </TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("tabApiKeys")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("apiKeysDescription")}
              </p>
            </div>
            <Button onClick={() => setCreateKeyOpen(true)}>
              <Plus className="size-4" />
              {t("createApiKey")}
            </Button>
          </div>

          {apiKeys.length === 0 && !keysLoading ? (
            <EmptyState
              icon={Key}
              title={t("noApiKeys")}
              description={t("noApiKeysDescription")}
            />
          ) : (
            <DataTable
              columns={keyColumns}
              data={apiKeys}
              loading={keysLoading}
              rowKey={(k) => k.id}
              emptyMessage={t("noApiKeysFound")}
            />
          )}
        </TabsContent>

        {/* Access Tokens Tab */}
        <TabsContent value="access-tokens" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("tabAccessTokens")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("accessTokensDescription")}
              </p>
            </div>
            <Button onClick={() => setCreateTokenOpen(true)}>
              <Plus className="size-4" />
              {t("createToken")}
            </Button>
          </div>

          {accessTokens.length === 0 && !tokensLoading ? (
            <EmptyState
              icon={Shield}
              title={t("noAccessTokens")}
              description={t("noAccessTokensDescription")}
            />
          ) : (
            <DataTable
              columns={tokenColumns}
              data={accessTokens}
              loading={tokensLoading}
              rowKey={(tok) => tok.id}
              emptyMessage={t("noAccessTokensFound")}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Create API Key Dialog */}
      <Dialog
        open={createKeyOpen}
        onOpenChange={(o) => {
          setCreateKeyOpen(o);
          if (!o) {
            setKeyName("");
            setKeyScopes(["read:artifacts"]);
            setKeyExpiry("90");
            setNewlyCreatedKey(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {newlyCreatedKey ? (
            <TokenCreatedAlert
              title={t("apiKeyCreatedTitle")}
              description={t("apiKeyCreatedDescription")}
              token={newlyCreatedKey}
              onDone={() => {
                setCreateKeyOpen(false);
                setNewlyCreatedKey(null);
              }}
            />
          ) : (
            <TokenCreateForm
              title={t("createApiKey")}
              description={t("createApiKeyDescription")}
              name={keyName}
              onNameChange={setKeyName}
              namePlaceholder={t("apiKeyNamePlaceholder")}
              expiry={keyExpiry}
              onExpiryChange={setKeyExpiry}
              scopes={keyScopes}
              onScopesChange={setKeyScopes}
              availableScopes={availableScopes}
              isPending={createKeyMutation.isPending}
              onSubmit={() =>
                createKeyMutation.mutate({
                  name: keyName,
                  expires_in_days:
                    keyExpiry === "0" ? undefined : Number(keyExpiry),
                  scopes: keyScopes,
                })
              }
              onCancel={() => setCreateKeyOpen(false)}
              submitLabel={t("createKeySubmit")}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create Access Token Dialog */}
      <Dialog
        open={createTokenOpen}
        onOpenChange={(o) => {
          setCreateTokenOpen(o);
          if (!o) {
            setTokenName("");
            setTokenScopes(["read:artifacts"]);
            setTokenExpiry("90");
            setTokenRepoSelector({});
            setNewlyCreatedToken(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {newlyCreatedToken ? (
            <TokenCreatedAlert
              title={t("tokenCreatedTitle")}
              description={t("tokenCreatedDescription")}
              token={newlyCreatedToken}
              onDone={() => {
                setCreateTokenOpen(false);
                setNewlyCreatedToken(null);
              }}
            />
          ) : (
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
              availableScopes={availableScopes}
              isPending={createTokenMutation.isPending}
              onSubmit={() => {
                const hasSelector =
                  (tokenRepoSelector.match_formats?.length ?? 0) > 0 ||
                  Object.keys(tokenRepoSelector.match_labels ?? {}).length > 0 ||
                  !!tokenRepoSelector.match_pattern;
                createTokenMutation.mutate({
                  name: tokenName,
                  expires_in_days:
                    tokenExpiry === "0" ? undefined : Number(tokenExpiry),
                  scopes: tokenScopes,
                  repo_selector: hasSelector ? tokenRepoSelector : undefined,
                });
              }}
              onCancel={() => setCreateTokenOpen(false)}
              submitLabel={t("createToken")}
              showRepoSelector
              repoSelector={tokenRepoSelector}
              onRepoSelectorChange={setTokenRepoSelector}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke API Key Confirm */}
      <ConfirmDialog
        open={!!revokeKeyId}
        onOpenChange={(o) => {
          if (!o) setRevokeKeyId(null);
        }}
        title={t("revokeKeyTitle")}
        description={t("revokeKeyDescription")}
        confirmText={t("revokeKeyConfirm")}
        danger
        loading={revokeKeyMutation.isPending}
        onConfirm={() => {
          if (revokeKeyId) revokeKeyMutation.mutate(revokeKeyId);
        }}
      />

      {/* Revoke Access Token Confirm */}
      <ConfirmDialog
        open={!!revokeTokenId}
        onOpenChange={(o) => {
          if (!o) setRevokeTokenId(null);
        }}
        title={t("revokeTokenTitle")}
        description={t("revokeTokenDescription")}
        confirmText={t("revokeTokenConfirm")}
        danger
        loading={revokeTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenId) revokeTokenMutation.mutate(revokeTokenId);
        }}
      />
    </div>
  );
}
