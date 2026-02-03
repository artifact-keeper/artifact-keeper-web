"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  ToggleLeft,
  ToggleRight,
  KeyRound,
  Globe,
  Server,
  FileKey,
  Loader2,
  CheckCircle,
  XCircle,
  Plug,
} from "lucide-react";

import { useAuth } from "@/providers/auth-provider";
import { ssoApi } from "@/lib/api/sso";
import type {
  OidcConfig,
  LdapConfig,
  SamlConfig,
  CreateOidcConfigRequest,
  UpdateOidcConfigRequest,
  CreateLdapConfigRequest,
  UpdateLdapConfigRequest,
  CreateSamlConfigRequest,
  UpdateSamlConfigRequest,
} from "@/types/sso";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// OIDC Tab
// ---------------------------------------------------------------------------

function OidcTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OidcConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OidcConfig | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("openid profile email");
  const [autoCreateUsers, setAutoCreateUsers] = useState(true);
  const [usernameClaim, setUsernameClaim] = useState("preferred_username");
  const [emailClaim, setEmailClaim] = useState("email");
  const [displayNameClaim, setDisplayNameClaim] = useState("name");
  const [groupsClaim, setGroupsClaim] = useState("groups");
  const [adminGroup, setAdminGroup] = useState("");

  const { data: configs, isLoading } = useQuery({
    queryKey: ["sso", "oidc"],
    queryFn: ssoApi.listOidc,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateOidcConfigRequest) => ssoApi.createOidc(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("OIDC provider created successfully");
      closeDialog();
    },
    onError: () => toast.error("Failed to create OIDC provider"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOidcConfigRequest }) =>
      ssoApi.updateOidc(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("OIDC provider updated successfully");
      closeDialog();
    },
    onError: () => toast.error("Failed to update OIDC provider"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ssoApi.deleteOidc(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("OIDC provider deleted");
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete OIDC provider"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableOidc(id) : ssoApi.enableOidc(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("Provider status updated");
    },
    onError: () => toast.error("Failed to toggle provider"),
  });

  function resetForm() {
    setName("");
    setIssuerUrl("");
    setClientId("");
    setClientSecret("");
    setScopes("openid profile email");
    setAutoCreateUsers(true);
    setUsernameClaim("preferred_username");
    setEmailClaim("email");
    setDisplayNameClaim("name");
    setGroupsClaim("groups");
    setAdminGroup("");
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(config: OidcConfig) {
    setEditTarget(config);
    setName(config.name);
    setIssuerUrl(config.issuer_url);
    setClientId(config.client_id);
    setClientSecret("");
    setScopes(config.scopes.join(" "));
    setAutoCreateUsers(config.auto_create_users);
    setUsernameClaim(config.attribute_mapping?.username || "preferred_username");
    setEmailClaim(config.attribute_mapping?.email || "email");
    setDisplayNameClaim(config.attribute_mapping?.display_name || "name");
    setGroupsClaim(config.attribute_mapping?.groups || "groups");
    setAdminGroup(config.attribute_mapping?.admin_group || "");
    setDialogOpen(true);
  }

  function handleSubmit() {
    const attributeMapping: Record<string, string> = {
      username: usernameClaim,
      email: emailClaim,
      display_name: displayNameClaim,
      groups: groupsClaim,
    };
    if (adminGroup) {
      attributeMapping.admin_group = adminGroup;
    }

    const scopeList = scopes
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (editTarget) {
      const data: UpdateOidcConfigRequest = {
        name,
        issuer_url: issuerUrl,
        client_id: clientId,
        scopes: scopeList,
        attribute_mapping: attributeMapping,
        auto_create_users: autoCreateUsers,
      };
      if (clientSecret) {
        data.client_secret = clientSecret;
      }
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate({
        name,
        issuer_url: issuerUrl,
        client_id: clientId,
        client_secret: clientSecret,
        scopes: scopeList,
        attribute_mapping: attributeMapping,
        auto_create_users: autoCreateUsers,
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">OIDC Providers</CardTitle>
            <CardDescription>
              OpenID Connect providers for federated authentication.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            Add Provider
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Issuer URL</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {config.issuer_url}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground font-mono text-xs">
                      {config.client_id}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={config.is_enabled ? "Active" : "Disabled"}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title={config.is_enabled ? "Disable" : "Enable"}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: config.id,
                              enabled: config.is_enabled,
                            })
                          }
                        >
                          {config.is_enabled ? (
                            <ToggleRight className="size-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(config)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Globe className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No OIDC providers configured.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                Add OIDC Provider
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit OIDC Provider" : "Add OIDC Provider"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update the OpenID Connect provider configuration."
                : "Configure a new OpenID Connect provider for SSO."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="oidc-name">Name</Label>
              <Input
                id="oidc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Google Workspace"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-issuer">Issuer URL</Label>
              <Input
                id="oidc-issuer"
                value={issuerUrl}
                onChange={(e) => setIssuerUrl(e.target.value)}
                placeholder="https://accounts.google.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-client-id">Client ID</Label>
              <Input
                id="oidc-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="your-client-id"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-client-secret">Client Secret</Label>
              <Input
                id="oidc-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  editTarget ? "Leave blank to keep existing" : "your-client-secret"
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-scopes">Scopes</Label>
              <Input
                id="oidc-scopes"
                value={scopes}
                onChange={(e) => setScopes(e.target.value)}
                placeholder="openid profile email"
              />
              <p className="text-xs text-muted-foreground">
                Space-separated list of OAuth scopes to request.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto Create Users</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically create user accounts on first login.
                </p>
              </div>
              <Switch
                checked={autoCreateUsers}
                onCheckedChange={setAutoCreateUsers}
              />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">Attribute Mapping</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-username">Username Claim</Label>
                  <Input
                    id="oidc-claim-username"
                    value={usernameClaim}
                    onChange={(e) => setUsernameClaim(e.target.value)}
                    placeholder="preferred_username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-email">Email Claim</Label>
                  <Input
                    id="oidc-claim-email"
                    value={emailClaim}
                    onChange={(e) => setEmailClaim(e.target.value)}
                    placeholder="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-display">Display Name Claim</Label>
                  <Input
                    id="oidc-claim-display"
                    value={displayNameClaim}
                    onChange={(e) => setDisplayNameClaim(e.target.value)}
                    placeholder="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-groups">Groups Claim</Label>
                  <Input
                    id="oidc-claim-groups"
                    value={groupsClaim}
                    onChange={(e) => setGroupsClaim(e.target.value)}
                    placeholder="groups"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-admin-group">Admin Group</Label>
                  <Input
                    id="oidc-admin-group"
                    value={adminGroup}
                    onChange={(e) => setAdminGroup(e.target.value)}
                    placeholder="artifact-keeper-admins"
                  />
                  <p className="text-xs text-muted-foreground">
                    Users in this group will be granted admin privileges.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name || !issuerUrl || !clientId || (!editTarget && !clientSecret) || isSaving}
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {editTarget ? "Save Changes" : "Create Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete OIDC Provider"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Users will no longer be able to sign in with this provider.`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// LDAP Tab
// ---------------------------------------------------------------------------

function LdapTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LdapConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LdapConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [bindDn, setBindDn] = useState("");
  const [bindPassword, setBindPassword] = useState("");
  const [userBaseDn, setUserBaseDn] = useState("");
  const [userFilter, setUserFilter] = useState("(uid={0})");
  const [useStarttls, setUseStarttls] = useState(false);
  const [usernameAttribute, setUsernameAttribute] = useState("uid");
  const [emailAttribute, setEmailAttribute] = useState("mail");
  const [displayNameAttribute, setDisplayNameAttribute] = useState("cn");
  const [groupsAttribute, setGroupsAttribute] = useState("memberOf");
  const [groupBaseDn, setGroupBaseDn] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [adminGroupDn, setAdminGroupDn] = useState("");
  const [priority, setPriority] = useState("0");

  const { data: configs, isLoading } = useQuery({
    queryKey: ["sso", "ldap"],
    queryFn: ssoApi.listLdap,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateLdapConfigRequest) => ssoApi.createLdap(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("LDAP provider created successfully");
      closeDialog();
    },
    onError: () => toast.error("Failed to create LDAP provider"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLdapConfigRequest }) =>
      ssoApi.updateLdap(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("LDAP provider updated successfully");
      closeDialog();
    },
    onError: () => toast.error("Failed to update LDAP provider"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ssoApi.deleteLdap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("LDAP provider deleted");
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete LDAP provider"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableLdap(id) : ssoApi.enableLdap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("Provider status updated");
    },
    onError: () => toast.error("Failed to toggle provider"),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => ssoApi.testLdap(id),
    onMutate: (id) => setTestingId(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          `Connection successful${result.response_time_ms ? ` (${result.response_time_ms}ms)` : ""}`
        );
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
      setTestingId(null);
    },
    onError: () => {
      toast.error("Failed to test LDAP connection");
      setTestingId(null);
    },
  });

  function resetForm() {
    setName("");
    setServerUrl("");
    setBindDn("");
    setBindPassword("");
    setUserBaseDn("");
    setUserFilter("(uid={0})");
    setUseStarttls(false);
    setUsernameAttribute("uid");
    setEmailAttribute("mail");
    setDisplayNameAttribute("cn");
    setGroupsAttribute("memberOf");
    setGroupBaseDn("");
    setGroupFilter("");
    setAdminGroupDn("");
    setPriority("0");
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(config: LdapConfig) {
    setEditTarget(config);
    setName(config.name);
    setServerUrl(config.server_url);
    setBindDn(config.bind_dn || "");
    setBindPassword("");
    setUserBaseDn(config.user_base_dn);
    setUserFilter(config.user_filter);
    setUseStarttls(config.use_starttls);
    setUsernameAttribute(config.username_attribute);
    setEmailAttribute(config.email_attribute);
    setDisplayNameAttribute(config.display_name_attribute);
    setGroupsAttribute(config.groups_attribute);
    setGroupBaseDn(config.group_base_dn || "");
    setGroupFilter(config.group_filter || "");
    setAdminGroupDn(config.admin_group_dn || "");
    setPriority(String(config.priority));
    setDialogOpen(true);
  }

  function handleSubmit() {
    const priorityNum = parseInt(priority, 10) || 0;

    if (editTarget) {
      const data: UpdateLdapConfigRequest = {
        name,
        server_url: serverUrl,
        bind_dn: bindDn || undefined,
        user_base_dn: userBaseDn,
        user_filter: userFilter,
        username_attribute: usernameAttribute,
        email_attribute: emailAttribute,
        display_name_attribute: displayNameAttribute,
        groups_attribute: groupsAttribute,
        group_base_dn: groupBaseDn || undefined,
        group_filter: groupFilter || undefined,
        admin_group_dn: adminGroupDn || undefined,
        use_starttls: useStarttls,
        priority: priorityNum,
      };
      if (bindPassword) {
        data.bind_password = bindPassword;
      }
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate({
        name,
        server_url: serverUrl,
        bind_dn: bindDn || undefined,
        bind_password: bindPassword || undefined,
        user_base_dn: userBaseDn,
        user_filter: userFilter,
        username_attribute: usernameAttribute,
        email_attribute: emailAttribute,
        display_name_attribute: displayNameAttribute,
        groups_attribute: groupsAttribute,
        group_base_dn: groupBaseDn || undefined,
        group_filter: groupFilter || undefined,
        admin_group_dn: adminGroupDn || undefined,
        use_starttls: useStarttls,
        priority: priorityNum,
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">LDAP Providers</CardTitle>
            <CardDescription>
              LDAP / Active Directory servers for directory-based authentication.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            Add Provider
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Server URL</TableHead>
                  <TableHead>User Base DN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground font-mono text-xs">
                      {config.server_url}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground text-xs">
                      {config.user_base_dn}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={config.is_enabled ? "Active" : "Disabled"}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Test Connection"
                          disabled={testingId === config.id}
                          onClick={() => testMutation.mutate(config.id)}
                        >
                          {testingId === config.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Plug className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title={config.is_enabled ? "Disable" : "Enable"}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: config.id,
                              enabled: config.is_enabled,
                            })
                          }
                        >
                          {config.is_enabled ? (
                            <ToggleRight className="size-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(config)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Server className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No LDAP providers configured.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                Add LDAP Provider
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit LDAP Provider" : "Add LDAP Provider"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update the LDAP directory server configuration."
                : "Configure a new LDAP directory server for SSO."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ldap-name">Name</Label>
              <Input
                id="ldap-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Corporate LDAP"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-server">Server URL</Label>
              <Input
                id="ldap-server"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="ldap://ldap.example.com:389"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-bind-dn">Bind DN</Label>
              <Input
                id="ldap-bind-dn"
                value={bindDn}
                onChange={(e) => setBindDn(e.target.value)}
                placeholder="cn=admin,dc=example,dc=com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-bind-password">Bind Password</Label>
              <Input
                id="ldap-bind-password"
                type="password"
                value={bindPassword}
                onChange={(e) => setBindPassword(e.target.value)}
                placeholder={
                  editTarget ? "Leave blank to keep existing" : "bind-password"
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-user-base-dn">User Base DN</Label>
              <Input
                id="ldap-user-base-dn"
                value={userBaseDn}
                onChange={(e) => setUserBaseDn(e.target.value)}
                placeholder="ou=users,dc=example,dc=com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-user-filter">User Filter</Label>
              <Input
                id="ldap-user-filter"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder="(uid={0})"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{0}"} as a placeholder for the username.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Use STARTTLS</Label>
                <p className="text-xs text-muted-foreground">
                  Upgrade the connection to TLS after connecting.
                </p>
              </div>
              <Switch checked={useStarttls} onCheckedChange={setUseStarttls} />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">Attribute Mapping</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-username">Username Attribute</Label>
                  <Input
                    id="ldap-attr-username"
                    value={usernameAttribute}
                    onChange={(e) => setUsernameAttribute(e.target.value)}
                    placeholder="uid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-email">Email Attribute</Label>
                  <Input
                    id="ldap-attr-email"
                    value={emailAttribute}
                    onChange={(e) => setEmailAttribute(e.target.value)}
                    placeholder="mail"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-display">Display Name Attribute</Label>
                  <Input
                    id="ldap-attr-display"
                    value={displayNameAttribute}
                    onChange={(e) => setDisplayNameAttribute(e.target.value)}
                    placeholder="cn"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-groups">Groups Attribute</Label>
                  <Input
                    id="ldap-attr-groups"
                    value={groupsAttribute}
                    onChange={(e) => setGroupsAttribute(e.target.value)}
                    placeholder="memberOf"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">Group Settings</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ldap-group-base-dn">Group Base DN</Label>
                  <Input
                    id="ldap-group-base-dn"
                    value={groupBaseDn}
                    onChange={(e) => setGroupBaseDn(e.target.value)}
                    placeholder="ou=groups,dc=example,dc=com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-group-filter">Group Filter</Label>
                  <Input
                    id="ldap-group-filter"
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    placeholder="(objectClass=groupOfNames)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-admin-group-dn">Admin Group DN</Label>
                  <Input
                    id="ldap-admin-group-dn"
                    value={adminGroupDn}
                    onChange={(e) => setAdminGroupDn(e.target.value)}
                    placeholder="cn=admins,ou=groups,dc=example,dc=com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Users in this group will be granted admin privileges.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="ldap-priority">Priority</Label>
              <Input
                id="ldap-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Lower values are tried first when multiple LDAP servers are configured.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name || !serverUrl || !userBaseDn || isSaving}
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {editTarget ? "Save Changes" : "Create Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete LDAP Provider"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Users will no longer be able to sign in with this provider.`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// SAML Tab
// ---------------------------------------------------------------------------

function SamlTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SamlConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SamlConfig | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [sloUrl, setSloUrl] = useState("");
  const [certificate, setCertificate] = useState("");
  const [spEntityId, setSpEntityId] = useState("artifact-keeper");
  const [nameIdFormat, setNameIdFormat] = useState("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
  const [signRequests, setSignRequests] = useState(false);
  const [requireSignedAssertions, setRequireSignedAssertions] = useState(true);
  const [usernameClaim, setUsernameClaim] = useState("username");
  const [emailClaim, setEmailClaim] = useState("email");
  const [displayNameClaim, setDisplayNameClaim] = useState("displayName");
  const [groupsClaim, setGroupsClaim] = useState("groups");
  const [adminGroup, setAdminGroup] = useState("");

  const { data: configs, isLoading } = useQuery({
    queryKey: ["sso", "saml"],
    queryFn: ssoApi.listSaml,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateSamlConfigRequest) => ssoApi.createSaml(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SAML provider created successfully");
      closeDialog();
    },
    onError: () => toast.error("Failed to create SAML provider"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSamlConfigRequest }) =>
      ssoApi.updateSaml(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SAML provider updated successfully");
      closeDialog();
    },
    onError: () => toast.error("Failed to update SAML provider"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ssoApi.deleteSaml(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("SAML provider deleted");
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete SAML provider"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableSaml(id) : ssoApi.enableSaml(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success("Provider status updated");
    },
    onError: () => toast.error("Failed to toggle provider"),
  });

  function resetForm() {
    setName("");
    setEntityId("");
    setSsoUrl("");
    setSloUrl("");
    setCertificate("");
    setSpEntityId("artifact-keeper");
    setNameIdFormat("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
    setSignRequests(false);
    setRequireSignedAssertions(true);
    setUsernameClaim("username");
    setEmailClaim("email");
    setDisplayNameClaim("displayName");
    setGroupsClaim("groups");
    setAdminGroup("");
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    resetForm();
  }

  function openCreate() {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(config: SamlConfig) {
    setEditTarget(config);
    setName(config.name);
    setEntityId(config.entity_id);
    setSsoUrl(config.sso_url);
    setSloUrl(config.slo_url || "");
    setCertificate("");
    setSpEntityId(config.sp_entity_id);
    setNameIdFormat(config.name_id_format);
    setSignRequests(config.sign_requests);
    setRequireSignedAssertions(config.require_signed_assertions);
    setUsernameClaim(config.attribute_mapping?.username || "username");
    setEmailClaim(config.attribute_mapping?.email || "email");
    setDisplayNameClaim(config.attribute_mapping?.display_name || "displayName");
    setGroupsClaim(config.attribute_mapping?.groups || "groups");
    setAdminGroup(config.admin_group || "");
    setDialogOpen(true);
  }

  function handleSubmit() {
    const attributeMapping: Record<string, string> = {
      username: usernameClaim,
      email: emailClaim,
      display_name: displayNameClaim,
      groups: groupsClaim,
    };

    if (editTarget) {
      const data: UpdateSamlConfigRequest = {
        name,
        entity_id: entityId,
        sso_url: ssoUrl,
        slo_url: sloUrl || undefined,
        sp_entity_id: spEntityId,
        name_id_format: nameIdFormat,
        attribute_mapping: attributeMapping,
        sign_requests: signRequests,
        require_signed_assertions: requireSignedAssertions,
        admin_group: adminGroup || undefined,
      };
      if (certificate) {
        data.certificate = certificate;
      }
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate({
        name,
        entity_id: entityId,
        sso_url: ssoUrl,
        slo_url: sloUrl || undefined,
        certificate,
        sp_entity_id: spEntityId,
        name_id_format: nameIdFormat,
        attribute_mapping: attributeMapping,
        sign_requests: signRequests,
        require_signed_assertions: requireSignedAssertions,
        admin_group: adminGroup || undefined,
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">SAML Providers</CardTitle>
            <CardDescription>
              SAML 2.0 identity providers for enterprise single sign-on.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            Add Provider
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>SSO URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground text-xs">
                      {config.entity_id}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground text-xs">
                      {config.sso_url}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={config.is_enabled ? "Active" : "Disabled"}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title={config.is_enabled ? "Disable" : "Enable"}
                          onClick={() =>
                            toggleMutation.mutate({
                              id: config.id,
                              enabled: config.is_enabled,
                            })
                          }
                        >
                          {config.is_enabled ? (
                            <ToggleRight className="size-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(config)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileKey className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No SAML providers configured.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                Add SAML Provider
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit SAML Provider" : "Add SAML Provider"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update the SAML 2.0 identity provider configuration."
                : "Configure a new SAML 2.0 identity provider for SSO."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="saml-name">Name</Label>
              <Input
                id="saml-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Okta"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-entity-id">Entity ID</Label>
              <Input
                id="saml-entity-id"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="https://idp.example.com/metadata"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-sso-url">SSO URL</Label>
              <Input
                id="saml-sso-url"
                value={ssoUrl}
                onChange={(e) => setSsoUrl(e.target.value)}
                placeholder="https://idp.example.com/sso/saml"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-slo-url">SLO URL (optional)</Label>
              <Input
                id="saml-slo-url"
                value={sloUrl}
                onChange={(e) => setSloUrl(e.target.value)}
                placeholder="https://idp.example.com/slo/saml"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-certificate">Certificate</Label>
              <Textarea
                id="saml-certificate"
                value={certificate}
                onChange={(e) => setCertificate(e.target.value)}
                placeholder={
                  editTarget
                    ? "Leave blank to keep existing certificate"
                    : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
                }
                rows={5}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-sp-entity-id">SP Entity ID</Label>
              <Input
                id="saml-sp-entity-id"
                value={spEntityId}
                onChange={(e) => setSpEntityId(e.target.value)}
                placeholder="artifact-keeper"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-name-id-format">NameID Format</Label>
              <Select value={nameIdFormat} onValueChange={setNameIdFormat}>
                <SelectTrigger id="saml-name-id-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
                    Email Address
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">
                    Unspecified
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">
                    Persistent
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">
                    Transient
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Sign Requests</Label>
                <p className="text-xs text-muted-foreground">
                  Sign authentication requests sent to the IdP.
                </p>
              </div>
              <Switch checked={signRequests} onCheckedChange={setSignRequests} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Require Signed Assertions</Label>
                <p className="text-xs text-muted-foreground">
                  Require the IdP to sign SAML assertions.
                </p>
              </div>
              <Switch
                checked={requireSignedAssertions}
                onCheckedChange={setRequireSignedAssertions}
              />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">Attribute Mapping</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-username">Username Attribute</Label>
                  <Input
                    id="saml-attr-username"
                    value={usernameClaim}
                    onChange={(e) => setUsernameClaim(e.target.value)}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-email">Email Attribute</Label>
                  <Input
                    id="saml-attr-email"
                    value={emailClaim}
                    onChange={(e) => setEmailClaim(e.target.value)}
                    placeholder="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-display">Display Name Attribute</Label>
                  <Input
                    id="saml-attr-display"
                    value={displayNameClaim}
                    onChange={(e) => setDisplayNameClaim(e.target.value)}
                    placeholder="displayName"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-groups">Groups Attribute</Label>
                  <Input
                    id="saml-attr-groups"
                    value={groupsClaim}
                    onChange={(e) => setGroupsClaim(e.target.value)}
                    placeholder="groups"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="saml-admin-group">Admin Group</Label>
              <Input
                id="saml-admin-group"
                value={adminGroup}
                onChange={(e) => setAdminGroup(e.target.value)}
                placeholder="artifact-keeper-admins"
              />
              <p className="text-xs text-muted-foreground">
                Users in this group will be granted admin privileges.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !name ||
                !entityId ||
                !ssoUrl ||
                (!editTarget && !certificate) ||
                isSaving
              }
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {editTarget ? "Save Changes" : "Create Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete SAML Provider"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Users will no longer be able to sign in with this provider.`}
        confirmText="Delete"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SsoSettingsPage() {
  const { user } = useAuth();

  const { data: oidcConfigs } = useQuery({
    queryKey: ["sso", "oidc"],
    queryFn: ssoApi.listOidc,
  });

  const { data: ldapConfigs } = useQuery({
    queryKey: ["sso", "ldap"],
    queryFn: ssoApi.listLdap,
  });

  const { data: samlConfigs } = useQuery({
    queryKey: ["sso", "saml"],
    queryFn: ssoApi.listSaml,
  });

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="SSO Providers" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You must be an administrator to manage SSO providers.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const oidcCount = oidcConfigs?.length ?? 0;
  const ldapCount = ldapConfigs?.length ?? 0;
  const samlCount = samlConfigs?.length ?? 0;
  const totalCount = oidcCount + ldapCount + samlCount;

  const enabledCount =
    (oidcConfigs?.filter((c) => c.is_enabled).length ?? 0) +
    (ldapConfigs?.filter((c) => c.is_enabled).length ?? 0) +
    (samlConfigs?.filter((c) => c.is_enabled).length ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SSO Providers"
        description="Configure single sign-on authentication providers."
      />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Shield}
          label="Total Providers"
          value={totalCount}
          color="blue"
        />
        <StatCard
          icon={CheckCircle}
          label="Enabled"
          value={enabledCount}
          color="green"
        />
        <StatCard
          icon={Globe}
          label="OIDC"
          value={oidcCount}
          color="purple"
        />
        <StatCard
          icon={Server}
          label="LDAP"
          value={ldapCount}
          color="yellow"
        />
        <StatCard
          icon={FileKey}
          label="SAML"
          value={samlCount}
          color="red"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="oidc">
        <TabsList>
          <TabsTrigger value="oidc">
            <Globe className="size-4 mr-1.5" />
            OIDC
          </TabsTrigger>
          <TabsTrigger value="ldap">
            <Server className="size-4 mr-1.5" />
            LDAP
          </TabsTrigger>
          <TabsTrigger value="saml">
            <FileKey className="size-4 mr-1.5" />
            SAML
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oidc" className="mt-4">
          <OidcTab />
        </TabsContent>

        <TabsContent value="ldap" className="mt-4">
          <LdapTab />
        </TabsContent>

        <TabsContent value="saml" className="mt-4">
          <SamlTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
