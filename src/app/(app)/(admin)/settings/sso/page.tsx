"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  ToggleLeft,
  ToggleRight,
  Globe,
  Server,
  FileKey,
  Loader2,
  CheckCircle,
  Plug,
} from "lucide-react";

import { useAuth } from "@/providers/auth-provider";
import { ssoApi } from "@/lib/api/sso";
import { toUserMessage, mutationErrorToast } from "@/lib/error-utils";
import type {
  OidcConfig,
  LdapConfig,
  SamlConfig,
  UpdateOidcConfigRequest,
  UpdateLdapConfigRequest,
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
  const t = useTranslations("admin.settingsSso");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OidcConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OidcConfig | null>(null);

  const [name, setName] = useState("");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("openid profile email");
  const [autoCreateUsers, setAutoCreateUsers] = useState(true);
  const [mapGroupsToGroups, setMapGroupsToGroups] = useState(false);
  const [allowLegacyRsaKeys, setAllowLegacyRsaKeys] = useState(false);
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
    mutationFn: ssoApi.createOidc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("oidcCreated"));
      closeDialog();
    },
    onError: mutationErrorToast(t("oidcCreatedError")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOidcConfigRequest }) =>
      ssoApi.updateOidc(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("oidcUpdated"));
      closeDialog();
    },
    onError: mutationErrorToast(t("oidcUpdatedError")),
  });

  const deleteMutation = useMutation({
    mutationFn: ssoApi.deleteOidc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("oidcDeleted"));
      setDeleteTarget(null);
    },
    onError: mutationErrorToast(t("oidcDeletedError")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableOidc(id) : ssoApi.enableOidc(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("oidcStatusUpdated"));
    },
    onError: mutationErrorToast(t("oidcStatusUpdateError")),
  });

  function resetForm() {
    setName("");
    setIssuerUrl("");
    setClientId("");
    setClientSecret("");
    setScopes("openid profile email");
    setAutoCreateUsers(true);
    setMapGroupsToGroups(false);
    setAllowLegacyRsaKeys(false);
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
    setMapGroupsToGroups(config.map_groups_to_groups);
    setAllowLegacyRsaKeys(config.allow_legacy_rsa_keys);
    // #516: the backend reads the OIDC claim overrides under the
    // `<field>_claim` keys (username_claim / email_claim / groups_claim).
    // Prefer those, but fall back to the legacy bare keys so a provider
    // saved by a pre-fix UI still displays its configured claim names.
    setUsernameClaim(
      config.attribute_mapping?.username_claim ||
        config.attribute_mapping?.username ||
        "preferred_username",
    );
    setEmailClaim(
      config.attribute_mapping?.email_claim ||
        config.attribute_mapping?.email ||
        "email",
    );
    setDisplayNameClaim(
      config.attribute_mapping?.display_name_claim ||
        config.attribute_mapping?.display_name ||
        "name",
    );
    setGroupsClaim(
      config.attribute_mapping?.groups_claim ||
        config.attribute_mapping?.groups ||
        "groups",
    );
    setAdminGroup(config.attribute_mapping?.admin_group || "");
    setDialogOpen(true);
  }

  function handleSubmit() {
    // #406: When editing an existing provider, preserve attribute_mapping
    // entries the form doesn't render (e.g. backend-managed keys set via
    // env vars such as the OIDC redirect_uri claim). The form only knows
    // about five fields, but the column is a JSONB blob — without the
    // spread, the PUT wipes everything else server-side.
    //
    // On create there's nothing to preserve, so start fresh.
    // #516: the backend (sso.rs::resolve_oidc_claim_name) expects the claim
    // overrides under the `<field>_claim` keys — `username_claim`,
    // `email_claim`, `groups_claim` (`display_name_claim` is not consumed by
    // the backend yet but is written for parity). The pre-fix UI wrote bare
    // `username` / `email` / `groups` keys that the backend silently ignored.
    const attributeMapping: Record<string, string> = {
      ...(editTarget?.attribute_mapping ?? {}),
      username_claim: usernameClaim,
      email_claim: emailClaim,
      display_name_claim: displayNameClaim,
      groups_claim: groupsClaim,
    };
    // Drop the legacy bare keys so an edited provider doesn't carry both the
    // old (ignored) and new claim keys in the JSONB blob.
    delete attributeMapping.username;
    delete attributeMapping.email;
    delete attributeMapping.display_name;
    delete attributeMapping.groups;
    if (adminGroup) {
      attributeMapping.admin_group = adminGroup;
    } else {
      // Empty admin_group means the operator deliberately cleared it —
      // drop the key so it isn't carried over from the previous state.
      delete attributeMapping.admin_group;
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
        map_groups_to_groups: mapGroupsToGroups,
        allow_legacy_rsa_keys: allowLegacyRsaKeys,
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
        map_groups_to_groups: mapGroupsToGroups,
        allow_legacy_rsa_keys: allowLegacyRsaKeys,
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
            <CardTitle className="text-base">{t("oidcProviders")}</CardTitle>
            <CardDescription>
              {t("oidcProvidersDescription")}
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            {t("addProvider")}
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colIssuerUrl")}</TableHead>
                  <TableHead>{t("colClientId")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
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
                        status={config.is_enabled ? t("active") : t("disabled")}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t("toggleAria", {
                            action: config.is_enabled ? t("disable") : t("enable"),
                            name: config.name,
                          })}
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
                          aria-label={t("editAria", { name: config.name })}
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={t("deleteAria", { name: config.name })}
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
                {t("noOidcProviders")}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                {t("addOidcProvider")}
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
              {editTarget ? t("editOidcProvider") : t("addOidcProvider")}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? t("editOidcProviderDescription")
                : t("addOidcProviderDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="oidc-name">{t("name")}</Label>
              <Input
                id="oidc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("oidcNamePlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-issuer">{t("issuerUrl")}</Label>
              <Input
                id="oidc-issuer"
                value={issuerUrl}
                onChange={(e) => setIssuerUrl(e.target.value)}
                placeholder={t("oidcIssuerPlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-client-id">{t("clientId")}</Label>
              <Input
                id="oidc-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={t("oidcClientIdPlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-client-secret">{t("clientSecret")}</Label>
              <Input
                id="oidc-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={
                  editTarget ? t("keepExistingPlaceholder") : t("oidcClientSecretPlaceholder")
                }
                aria-required={!editTarget}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="oidc-scopes">{t("scopes")}</Label>
              <Input
                id="oidc-scopes"
                value={scopes}
                onChange={(e) => setScopes(e.target.value)}
                placeholder="openid profile email"
              />
              <p className="text-xs text-muted-foreground">
                {t("scopesHint")}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="oidc-auto-create-users">{t("autoCreateUsers")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("autoCreateUsersHint")}
                </p>
              </div>
              <Switch
                id="oidc-auto-create-users"
                checked={autoCreateUsers}
                onCheckedChange={setAutoCreateUsers}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="oidc-map-groups-to-groups">
                  {t("mapGroupsToGroups")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("mapGroupsToGroupsOidcHint")}
                </p>
              </div>
              <Switch
                id="oidc-map-groups-to-groups"
                checked={mapGroupsToGroups}
                onCheckedChange={setMapGroupsToGroups}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="oidc-allow-legacy-rsa-keys">
                  {t("allowLegacyRsaKeys")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("allowLegacyRsaKeysHint")}{" "}
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {t("owaspWarning")}
                  </span>
                </p>
              </div>
              <Switch
                id="oidc-allow-legacy-rsa-keys"
                checked={allowLegacyRsaKeys}
                onCheckedChange={setAllowLegacyRsaKeys}
              />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">{t("attributeMapping")}</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-username">{t("usernameClaim")}</Label>
                  <Input
                    id="oidc-claim-username"
                    value={usernameClaim}
                    onChange={(e) => setUsernameClaim(e.target.value)}
                    placeholder="preferred_username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-email">{t("emailClaim")}</Label>
                  <Input
                    id="oidc-claim-email"
                    value={emailClaim}
                    onChange={(e) => setEmailClaim(e.target.value)}
                    placeholder="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-display">{t("displayNameClaim")}</Label>
                  <Input
                    id="oidc-claim-display"
                    value={displayNameClaim}
                    onChange={(e) => setDisplayNameClaim(e.target.value)}
                    placeholder="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-claim-groups">{t("groupsClaim")}</Label>
                  <Input
                    id="oidc-claim-groups"
                    value={groupsClaim}
                    onChange={(e) => setGroupsClaim(e.target.value)}
                    placeholder="groups"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="oidc-admin-group">{t("adminGroup")}</Label>
                  <Input
                    id="oidc-admin-group"
                    value={adminGroup}
                    onChange={(e) => setAdminGroup(e.target.value)}
                    placeholder="artifact-keeper-admins"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("adminGroupHint")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name || !issuerUrl || !clientId || (!editTarget && !clientSecret) || isSaving}
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {editTarget ? t("saveChanges") : t("createProvider")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteOidcProvider")}
        description={t("deleteProviderDescription", {
          name: deleteTarget?.name ?? "",
        })}
        confirmText={t("delete")}
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
  const t = useTranslations("admin.settingsSso");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LdapConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LdapConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

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
    mutationFn: ssoApi.createLdap,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("ldapCreated"));
      closeDialog();
    },
    onError: mutationErrorToast(t("ldapCreatedError")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateLdapConfigRequest }) =>
      ssoApi.updateLdap(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("ldapUpdated"));
      closeDialog();
    },
    onError: mutationErrorToast(t("ldapUpdatedError")),
  });

  const deleteMutation = useMutation({
    mutationFn: ssoApi.deleteLdap,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("ldapDeleted"));
      setDeleteTarget(null);
    },
    onError: mutationErrorToast(t("ldapDeletedError")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableLdap(id) : ssoApi.enableLdap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("ldapStatusUpdated"));
    },
    onError: mutationErrorToast(t("ldapStatusUpdateError")),
  });

  const testMutation = useMutation({
    mutationFn: ssoApi.testLdap,
    onMutate: (id) => setTestingId(id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          result.response_time_ms
            ? t("ldapConnectionSuccessMs", { ms: result.response_time_ms })
            : t("ldapConnectionSuccess")
        );
      } else {
        toast.error(t("ldapConnectionFailed", { message: result.message }));
      }
      setTestingId(null);
    },
    onError: (err: unknown) => {
      toast.error(toUserMessage(err, t("ldapTestError")));
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
            <CardTitle className="text-base">{t("ldapProviders")}</CardTitle>
            <CardDescription>
              {t("ldapProvidersDescription")}
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            {t("addProvider")}
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colServerUrl")}</TableHead>
                  <TableHead>{t("colUserBaseDn")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
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
                        status={config.is_enabled ? t("active") : t("disabled")}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t("testLdapAria", { name: config.name })}
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
                          aria-label={t("toggleAria", {
                            action: config.is_enabled ? t("disable") : t("enable"),
                            name: config.name,
                          })}
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
                          aria-label={t("editAria", { name: config.name })}
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={t("deleteAria", { name: config.name })}
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
                {t("noLdapProviders")}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                {t("addLdapProvider")}
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
              {editTarget ? t("editLdapProvider") : t("addLdapProvider")}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? t("editLdapProviderDescription")
                : t("addLdapProviderDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ldap-name">{t("name")}</Label>
              <Input
                id="ldap-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("ldapNamePlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-server">{t("serverUrl")}</Label>
              <Input
                id="ldap-server"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder={t("ldapServerPlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-bind-dn">{t("bindDn")}</Label>
              <Input
                id="ldap-bind-dn"
                value={bindDn}
                onChange={(e) => setBindDn(e.target.value)}
                placeholder={t("bindDnPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-bind-password">{t("bindPassword")}</Label>
              <Input
                id="ldap-bind-password"
                type="password"
                value={bindPassword}
                onChange={(e) => setBindPassword(e.target.value)}
                placeholder={
                  editTarget ? t("keepExistingPlaceholder") : t("bindPasswordPlaceholder")
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-user-base-dn">{t("userBaseDn")}</Label>
              <Input
                id="ldap-user-base-dn"
                value={userBaseDn}
                onChange={(e) => setUserBaseDn(e.target.value)}
                placeholder={t("userBaseDnPlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ldap-user-filter">{t("userFilter")}</Label>
              <Input
                id="ldap-user-filter"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder="(uid={0})"
              />
              <p className="text-xs text-muted-foreground">
                {t("userFilterHint")}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="ldap-use-starttls">{t("useStarttls")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("useStarttlsHint")}
                </p>
              </div>
              <Switch id="ldap-use-starttls" checked={useStarttls} onCheckedChange={setUseStarttls} />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">{t("attributeMapping")}</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-username">{t("usernameAttribute")}</Label>
                  <Input
                    id="ldap-attr-username"
                    value={usernameAttribute}
                    onChange={(e) => setUsernameAttribute(e.target.value)}
                    placeholder="uid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-email">{t("emailAttribute")}</Label>
                  <Input
                    id="ldap-attr-email"
                    value={emailAttribute}
                    onChange={(e) => setEmailAttribute(e.target.value)}
                    placeholder="mail"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-display">{t("displayNameAttribute")}</Label>
                  <Input
                    id="ldap-attr-display"
                    value={displayNameAttribute}
                    onChange={(e) => setDisplayNameAttribute(e.target.value)}
                    placeholder="cn"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-attr-groups">{t("groupsAttribute")}</Label>
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
              <p className="text-sm font-medium mb-3">{t("groupSettings")}</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ldap-group-base-dn">{t("groupBaseDn")}</Label>
                  <Input
                    id="ldap-group-base-dn"
                    value={groupBaseDn}
                    onChange={(e) => setGroupBaseDn(e.target.value)}
                    placeholder={t("groupBaseDnPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-group-filter">{t("groupFilter")}</Label>
                  <Input
                    id="ldap-group-filter"
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    placeholder={t("groupFilterPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-admin-group-dn">{t("adminGroupDn")}</Label>
                  <Input
                    id="ldap-admin-group-dn"
                    value={adminGroupDn}
                    onChange={(e) => setAdminGroupDn(e.target.value)}
                    placeholder={t("adminGroupDnPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("adminGroupHint")}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="ldap-priority">{t("priority")}</Label>
              <Input
                id="ldap-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                {t("priorityHint")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name || !serverUrl || !userBaseDn || isSaving}
            >
              {isSaving && <Loader2 className="size-4 animate-spin mr-1.5" />}
              {editTarget ? t("saveChanges") : t("createProvider")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteLdapProvider")}
        description={t("deleteProviderDescription", {
          name: deleteTarget?.name ?? "",
        })}
        confirmText={t("delete")}
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
  const t = useTranslations("admin.settingsSso");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SamlConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SamlConfig | null>(null);

  const [name, setName] = useState("");
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [sloUrl, setSloUrl] = useState("");
  const [certificate, setCertificate] = useState("");
  const [spEntityId, setSpEntityId] = useState("artifact-keeper");
  const [nameIdFormat, setNameIdFormat] = useState("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
  const [signRequests, setSignRequests] = useState(false);
  const [requireSignedAssertions, setRequireSignedAssertions] = useState(true);
  const [useAbsoluteAcsUrl, setUseAbsoluteAcsUrl] = useState(false);
  const [mapGroupsToGroups, setMapGroupsToGroups] = useState(false);
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
    mutationFn: ssoApi.createSaml,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("samlCreated"));
      closeDialog();
    },
    onError: mutationErrorToast(t("samlCreatedError")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSamlConfigRequest }) =>
      ssoApi.updateSaml(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("samlUpdated"));
      closeDialog();
    },
    onError: mutationErrorToast(t("samlUpdatedError")),
  });

  const deleteMutation = useMutation({
    mutationFn: ssoApi.deleteSaml,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("samlDeleted"));
      setDeleteTarget(null);
    },
    onError: mutationErrorToast(t("samlDeletedError")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? ssoApi.disableSaml(id) : ssoApi.enableSaml(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso"] });
      toast.success(t("samlStatusUpdated"));
    },
    onError: mutationErrorToast(t("samlStatusUpdateError")),
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
    setUseAbsoluteAcsUrl(false);
    setMapGroupsToGroups(false);
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
    setUseAbsoluteAcsUrl(config.use_absolute_acs_url);
    setMapGroupsToGroups(config.map_groups_to_groups);
    setUsernameClaim(config.attribute_mapping?.username || "username");
    setEmailClaim(config.attribute_mapping?.email || "email");
    setDisplayNameClaim(config.attribute_mapping?.display_name || "displayName");
    setGroupsClaim(config.attribute_mapping?.groups || "groups");
    setAdminGroup(config.admin_group || "");
    setDialogOpen(true);
  }

  function handleSubmit() {
    // #406: Same wholesale-overwrite hazard as the OIDC tab — the SAML
    // attribute_mapping column is a JSONB blob, so rebuilding it from only
    // the four form-rendered claim inputs (username/email/display_name/
    // groups) would wipe any extra keys the backend may have written. Spread
    // editTarget.attribute_mapping first so unknown keys round-trip.
    // On create there's nothing to preserve, so the spread is a no-op.
    const attributeMapping: Record<string, string> = {
      ...(editTarget?.attribute_mapping ?? {}),
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
        use_absolute_acs_url: useAbsoluteAcsUrl,
        map_groups_to_groups: mapGroupsToGroups,
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
        use_absolute_acs_url: useAbsoluteAcsUrl,
        map_groups_to_groups: mapGroupsToGroups,
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
            <CardTitle className="text-base">{t("samlProviders")}</CardTitle>
            <CardDescription>
              {t("samlProvidersDescription")}
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            {t("addProvider")}
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colEntityId")}</TableHead>
                  <TableHead>{t("colSsoUrl")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
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
                        status={config.is_enabled ? t("active") : t("disabled")}
                        color={config.is_enabled ? "green" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t("toggleAria", {
                            action: config.is_enabled ? t("disable") : t("enable"),
                            name: config.name,
                          })}
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
                          aria-label={t("editAria", { name: config.name })}
                          onClick={() => openEdit(config)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={t("deleteAria", { name: config.name })}
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
                {t("noSamlProviders")}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-1.5" />
                {t("addSamlProvider")}
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
              {editTarget ? t("editSamlProvider") : t("addSamlProvider")}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? t("editSamlProviderDescription")
                : t("addSamlProviderDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="saml-name">{t("name")}</Label>
              <Input
                id="saml-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("samlNamePlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-entity-id">{t("entityId")}</Label>
              <Input
                id="saml-entity-id"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder={t("samlEntityIdPlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-sso-url">{t("ssoUrl")}</Label>
              <Input
                id="saml-sso-url"
                value={ssoUrl}
                onChange={(e) => setSsoUrl(e.target.value)}
                placeholder={t("samlSsoUrlPlaceholder")}
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-slo-url">{t("sloUrlOptional")}</Label>
              <Input
                id="saml-slo-url"
                value={sloUrl}
                onChange={(e) => setSloUrl(e.target.value)}
                placeholder={t("samlSloUrlPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-certificate">{t("certificate")}</Label>
              <Textarea
                id="saml-certificate"
                value={certificate}
                onChange={(e) => setCertificate(e.target.value)}
                placeholder={
                  editTarget
                    ? t("keepExistingCertificatePlaceholder")
                    : t("certificatePlaceholder")
                }
                rows={5}
                className="font-mono text-xs"
                aria-required={!editTarget}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-sp-entity-id">{t("spEntityId")}</Label>
              <Input
                id="saml-sp-entity-id"
                value={spEntityId}
                onChange={(e) => setSpEntityId(e.target.value)}
                placeholder="artifact-keeper"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saml-name-id-format">{t("nameIdFormat")}</Label>
              <Select value={nameIdFormat} onValueChange={setNameIdFormat}>
                <SelectTrigger id="saml-name-id-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
                    {t("nameIdEmailAddress")}
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">
                    {t("nameIdUnspecified")}
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">
                    {t("nameIdPersistent")}
                  </SelectItem>
                  <SelectItem value="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">
                    {t("nameIdTransient")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="saml-sign-requests">{t("signRequests")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("signRequestsHint")}
                </p>
              </div>
              <Switch id="saml-sign-requests" checked={signRequests} onCheckedChange={setSignRequests} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="saml-require-signed-assertions">{t("requireSignedAssertions")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("requireSignedAssertionsHint")}
                </p>
              </div>
              <Switch
                id="saml-require-signed-assertions"
                checked={requireSignedAssertions}
                onCheckedChange={setRequireSignedAssertions}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="saml-use-absolute-acs-url">{t("useAbsoluteAcsUrl")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("useAbsoluteAcsUrlHint")}
                </p>
              </div>
              <Switch
                id="saml-use-absolute-acs-url"
                checked={useAbsoluteAcsUrl}
                onCheckedChange={setUseAbsoluteAcsUrl}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="saml-map-groups-to-groups">
                  {t("mapGroupsToGroupsSaml")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("mapGroupsToGroupsSamlHint")}
                </p>
              </div>
              <Switch
                id="saml-map-groups-to-groups"
                checked={mapGroupsToGroups}
                onCheckedChange={setMapGroupsToGroups}
              />
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-3">{t("attributeMapping")}</p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-username">{t("usernameAttribute")}</Label>
                  <Input
                    id="saml-attr-username"
                    value={usernameClaim}
                    onChange={(e) => setUsernameClaim(e.target.value)}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-email">{t("emailAttribute")}</Label>
                  <Input
                    id="saml-attr-email"
                    value={emailClaim}
                    onChange={(e) => setEmailClaim(e.target.value)}
                    placeholder="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-display">{t("displayNameAttribute")}</Label>
                  <Input
                    id="saml-attr-display"
                    value={displayNameClaim}
                    onChange={(e) => setDisplayNameClaim(e.target.value)}
                    placeholder="displayName"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="saml-attr-groups">{t("groupsAttribute")}</Label>
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
              <Label htmlFor="saml-admin-group">{t("adminGroup")}</Label>
              <Input
                id="saml-admin-group"
                value={adminGroup}
                onChange={(e) => setAdminGroup(e.target.value)}
                placeholder="artifact-keeper-admins"
              />
              <p className="text-xs text-muted-foreground">
                {t("adminGroupHint")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              {t("cancel")}
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
              {editTarget ? t("saveChanges") : t("createProvider")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteSamlProvider")}
        description={t("deleteProviderDescription", {
          name: deleteTarget?.name ?? "",
        })}
        confirmText={t("delete")}
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
  const t = useTranslations("admin.settingsSso");
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
        <PageHeader title={t("title")} />
        <Alert variant="destructive">
          <AlertTitle>{t("accessDenied")}</AlertTitle>
          <AlertDescription>
            {t("accessDeniedDescription")}
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
        title={t("title")}
        description={t("description")}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Shield}
          label={t("statTotalProviders")}
          value={totalCount}
          color="blue"
        />
        <StatCard
          icon={CheckCircle}
          label={t("statEnabled")}
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
