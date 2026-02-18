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

import { profileApi } from "@/lib/api/profile";
import type {
  ApiKey,
  AccessToken,
  CreateApiKeyRequest,
  CreateAccessTokenRequest,
  CreateApiKeyResponse,
  CreateAccessTokenResponse,
} from "@/lib/api/profile";
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
  if (!value) return <span className="text-sm text-muted-foreground">Never</span>;
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

export default function AccessTokensPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const availableScopes = SCOPES.filter(
    (s) => s.value !== "admin" || user?.is_admin
  );

  // API Key state
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyExpiry, setKeyExpiry] = useState("90");
  const [keyScopes, setKeyScopes] = useState<string[]>(["read"]);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);

  // Access Token state
  const [createTokenOpen, setCreateTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("90");
  const [tokenScopes, setTokenScopes] = useState<string[]>(["read"]);
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
      setNewlyCreatedKey(result.key);
      setKeyName("");
      setKeyScopes(["read"]);
      setKeyExpiry("90");
      toast.success("API key created");
    },
    onError: () => toast.error("Failed to create API key"),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => profileApi.deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "api-keys"] });
      setRevokeKeyId(null);
      toast.success("API key revoked");
    },
    onError: () => toast.error("Failed to revoke API key"),
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
      setTokenScopes(["read"]);
      setTokenExpiry("90");
      toast.success("Access token created");
    },
    onError: () => toast.error("Failed to create access token"),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (id: string) => profileApi.deleteAccessToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["profile", "access-tokens"],
      });
      setRevokeTokenId(null);
      toast.success("Access token revoked");
    },
    onError: () => toast.error("Failed to revoke access token"),
  });

  // Column definitions
  const keyColumns: DataTableColumn<ApiKey>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (k) => k.name,
      sortable: true,
      cell: (k) => (
        <div className="flex items-center gap-2">
          <Key className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{k.name}</span>
        </div>
      ),
    },
    { id: "prefix", header: "Key Prefix", cell: (k) => <TokenPrefix prefix={k.key_prefix} /> },
    { id: "scopes", header: "Scopes", cell: (k) => <ScopeBadges scopes={k.scopes} /> },
    { id: "expires", header: "Expires", accessor: (k) => k.expires_at ?? "", cell: (k) => <DateCell value={k.expires_at} /> },
    { id: "last_used", header: "Last Used", accessor: (k) => k.last_used_at ?? "", cell: (k) => <DateCell value={k.last_used_at} /> },
    { id: "created", header: "Created", accessor: (k) => k.created_at, sortable: true, cell: (k) => <DateCell value={k.created_at} /> },
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
            <TooltipContent>Revoke</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  const tokenColumns: DataTableColumn<AccessToken>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (t) => t.name,
      sortable: true,
      cell: (t) => (
        <div className="flex items-center gap-2">
          <Shield className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-sm">{t.name}</span>
        </div>
      ),
    },
    { id: "prefix", header: "Token Prefix", cell: (t) => <TokenPrefix prefix={t.token_prefix} /> },
    { id: "scopes", header: "Scopes", cell: (t) => <ScopeBadges scopes={t.scopes} /> },
    { id: "expires", header: "Expires", accessor: (t) => t.expires_at ?? "", cell: (t) => <DateCell value={t.expires_at} /> },
    { id: "last_used", header: "Last Used", accessor: (t) => t.last_used_at ?? "", cell: (t) => <DateCell value={t.last_used_at} /> },
    { id: "created", header: "Created", accessor: (t) => t.created_at, sortable: true, cell: (t) => <DateCell value={t.created_at} /> },
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
        title="Access Tokens"
        description="Manage API keys and personal access tokens for programmatic access to the registry."
      />

      <Tabs defaultValue="api-keys">
        <TabsList>
          <TabsTrigger value="api-keys">
            <Key className="size-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="access-tokens">
            <Shield className="size-4" />
            Access Tokens
          </TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">API Keys</h2>
              <p className="text-sm text-muted-foreground">
                Use API keys for programmatic access to the registry API.
              </p>
            </div>
            <Button onClick={() => setCreateKeyOpen(true)}>
              <Plus className="size-4" />
              Create API Key
            </Button>
          </div>

          {apiKeys.length === 0 && !keysLoading ? (
            <EmptyState
              icon={Key}
              title="No API keys"
              description="Create an API key for programmatic access to the registry."
              action={
                <Button onClick={() => setCreateKeyOpen(true)}>
                  <Plus className="size-4" />
                  Create API Key
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={keyColumns}
              data={apiKeys}
              loading={keysLoading}
              rowKey={(k) => k.id}
              emptyMessage="No API keys found."
            />
          )}
        </TabsContent>

        {/* Access Tokens Tab */}
        <TabsContent value="access-tokens" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Access Tokens</h2>
              <p className="text-sm text-muted-foreground">
                Personal access tokens for CLI and CI/CD authentication.
              </p>
            </div>
            <Button onClick={() => setCreateTokenOpen(true)}>
              <Plus className="size-4" />
              Create Token
            </Button>
          </div>

          {accessTokens.length === 0 && !tokensLoading ? (
            <EmptyState
              icon={Shield}
              title="No access tokens"
              description="Create a personal access token for CLI or CI/CD authentication."
              action={
                <Button onClick={() => setCreateTokenOpen(true)}>
                  <Plus className="size-4" />
                  Create Token
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={tokenColumns}
              data={accessTokens}
              loading={tokensLoading}
              rowKey={(t) => t.id}
              emptyMessage="No access tokens found."
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
            setKeyScopes(["read"]);
            setKeyExpiry("90");
            setNewlyCreatedKey(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {newlyCreatedKey ? (
            <TokenCreatedAlert
              title="API Key Created"
              description="Copy your API key now. You will not be able to see it again."
              token={newlyCreatedKey}
              onDone={() => {
                setCreateKeyOpen(false);
                setNewlyCreatedKey(null);
              }}
            />
          ) : (
            <TokenCreateForm
              title="Create API Key"
              description="Generate a new API key for programmatic access."
              name={keyName}
              onNameChange={setKeyName}
              namePlaceholder="e.g., CI/CD Pipeline"
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
              submitLabel="Create Key"
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
            setTokenScopes(["read"]);
            setTokenExpiry("90");
            setNewlyCreatedToken(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {newlyCreatedToken ? (
            <TokenCreatedAlert
              title="Access Token Created"
              description="Copy your access token now. You will not be able to see it again."
              token={newlyCreatedToken}
              onDone={() => {
                setCreateTokenOpen(false);
                setNewlyCreatedToken(null);
              }}
            />
          ) : (
            <TokenCreateForm
              title="Create Access Token"
              description="Generate a personal access token for CLI or CI/CD authentication."
              name={tokenName}
              onNameChange={setTokenName}
              namePlaceholder="e.g., Local Development"
              expiry={tokenExpiry}
              onExpiryChange={setTokenExpiry}
              scopes={tokenScopes}
              onScopesChange={setTokenScopes}
              availableScopes={availableScopes}
              isPending={createTokenMutation.isPending}
              onSubmit={() =>
                createTokenMutation.mutate({
                  name: tokenName,
                  expires_in_days:
                    tokenExpiry === "0" ? undefined : Number(tokenExpiry),
                  scopes: tokenScopes,
                })
              }
              onCancel={() => setCreateTokenOpen(false)}
              submitLabel="Create Token"
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
        title="Revoke API Key"
        description="This will permanently invalidate this API key. Any applications using it will lose access immediately."
        confirmText="Revoke Key"
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
        title="Revoke Access Token"
        description="This will permanently invalidate this access token. Any sessions using it will be terminated."
        confirmText="Revoke Token"
        danger
        loading={revokeTokenMutation.isPending}
        onConfirm={() => {
          if (revokeTokenId) revokeTokenMutation.mutate(revokeTokenId);
        }}
      />
    </div>
  );
}
