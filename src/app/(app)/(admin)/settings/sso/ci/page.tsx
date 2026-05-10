"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  GitBranch,
  Cpu,
  ChevronDown,
  ChevronRight,
  Filter,
  ShieldCheck,
} from "lucide-react";

import { ciOidcApi } from "@/lib/api/ci-oidc";
import { mutationErrorToast } from "@/lib/error-utils";
import type {
  CiOidcProvider,
  CiOidcIdentityMapping,
  CiOidcProviderType,
  ClaimFilters,
  CreateCiOidcProviderRequest,
  UpdateCiOidcProviderRequest,
  CreateCiOidcMappingRequest,
  UpdateCiOidcMappingRequest,
} from "@/types/ci-oidc";

import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ---------------------------------------------------------------------------
// Provider type helpers
// ---------------------------------------------------------------------------

const PROVIDER_TYPE_LABELS: Record<CiOidcProviderType, string> = {
  gitlab: "GitLab",
  github: "GitHub Actions",
  generic: "Generic OIDC",
};

const DEFAULT_ISSUER: Record<CiOidcProviderType, string> = {
  gitlab: "https://gitlab.com",
  github: "https://token.actions.githubusercontent.com",
  generic: "",
};

const CLAIM_PLACEHOLDER: Record<CiOidcProviderType, string> = {
  gitlab: `{\n  "namespace_path": "my-org/my-group",\n  "ref_protected": "true"\n}`,
  github: `{\n  "repository": "my-org/my-repo",\n  "ref": "refs/heads/main"\n}`,
  generic: `{\n  "sub": "system:serviceaccount:prod"\n}`,
};

function ProviderTypeIcon({ type }: { type: string }) {
  if (type === "gitlab" || type === "github")
    return <GitBranch className="size-4" />;
  return <Cpu className="size-4" />;
}

// ---------------------------------------------------------------------------
// Provider form
// ---------------------------------------------------------------------------

const BLANK_PROVIDER_FORM = {
  name: "",
  provider_type: "generic" as CiOidcProviderType,
  issuer_url: "",
  audience: "artifact-keeper",
};
type ProviderForm = typeof BLANK_PROVIDER_FORM;

function providerFormFromRow(p: CiOidcProvider): ProviderForm {
  return {
    name: p.name,
    provider_type: p.provider_type,
    issuer_url: p.issuer_url,
    audience: p.audience,
  };
}

// ---------------------------------------------------------------------------
// Mapping form
// ---------------------------------------------------------------------------

const BLANK_MAPPING_FORM = {
  name: "",
  priority: "100",
  claim_filters_raw: "",
  role_id: "",
  allowed_repo_ids_raw: "",
  is_enabled: true,
};
type MappingForm = typeof BLANK_MAPPING_FORM;

function mappingFormFromRow(m: CiOidcIdentityMapping): MappingForm {
  return {
    name: m.name,
    priority: String(m.priority),
    claim_filters_raw: JSON.stringify(m.claim_filters, null, 2),
    role_id: m.role_id ?? "",
    allowed_repo_ids_raw: m.allowed_repo_ids ? m.allowed_repo_ids.join("\n") : "",
    is_enabled: m.is_enabled,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseClaimFilters(raw: string): ClaimFilters | undefined {
  const t = raw.trim();
  if (!t) return {};
  try {
    return JSON.parse(t) as ClaimFilters;
  } catch {
    return undefined;
  }
}

function parseRepoIds(raw: string): string[] | null {
  const ids = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? ids : null;
}

function claimFilterSummary(filters: ClaimFilters): string {
  const keys = Object.keys(filters);
  if (!keys.length) return "No filters (any JWT accepted)";
  return keys
    .map((k) => {
      const v = filters[k];
      return Array.isArray(v) ? `${k} ∈ [${v.join(", ")}]` : `${k} = ${v}`;
    })
    .join(", ");
}

// ---------------------------------------------------------------------------
// Mappings sub-panel
// ---------------------------------------------------------------------------

interface MappingsPanelProps {
  provider: CiOidcProvider;
}

function MappingsPanel({ provider }: MappingsPanelProps) {
  const queryClient = useQueryClient();
  const qKey = ["ci-oidc-mappings", provider.id];

  const { data: mappings, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => ciOidcApi.listMappings(provider.id),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CiOidcIdentityMapping | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CiOidcIdentityMapping | null>(null);
  const [form, setForm] = useState<MappingForm>(BLANK_MAPPING_FORM);
  const [filtersError, setFiltersError] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: qKey });
    queryClient.invalidateQueries({ queryKey: ["ci-oidc"] });
  }

  const createMutation = useMutation({
    mutationFn: (req: CreateCiOidcMappingRequest) =>
      ciOidcApi.createMapping(provider.id, req),
    onSuccess: () => {
      invalidate();
      toast.success("Mapping created");
      closeDialog();
    },
    onError: mutationErrorToast("Failed to create mapping"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateCiOidcMappingRequest }) =>
      ciOidcApi.updateMapping(provider.id, id, req),
    onSuccess: () => {
      invalidate();
      toast.success("Mapping updated");
      closeDialog();
    },
    onError: mutationErrorToast("Failed to update mapping"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ciOidcApi.deleteMapping(provider.id, id),
    onSuccess: () => {
      invalidate();
      toast.success("Mapping deleted");
      setDeleteTarget(null);
    },
    onError: mutationErrorToast("Failed to delete mapping"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      ciOidcApi.toggleMapping(provider.id, id, { enabled }),
    onSuccess: () => invalidate(),
    onError: mutationErrorToast("Failed to toggle mapping"),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    setForm(BLANK_MAPPING_FORM);
    setFiltersError(null);
  }

  function openCreate() {
    setEditTarget(null);
    setForm({
      ...BLANK_MAPPING_FORM,
      claim_filters_raw: CLAIM_PLACEHOLDER[provider.provider_type] ?? "",
    });
    setFiltersError(null);
    setDialogOpen(true);
  }

  function openEdit(m: CiOidcIdentityMapping) {
    setEditTarget(m);
    setForm(mappingFormFromRow(m));
    setFiltersError(null);
    setDialogOpen(true);
  }

  function setField<K extends keyof MappingForm>(key: K, value: MappingForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    setFiltersError(null);
    const filters = parseClaimFilters(form.claim_filters_raw);
    if (filters === undefined) {
      setFiltersError("Invalid JSON — please fix claim_filters before saving.");
      return;
    }
    const priority = parseInt(form.priority, 10);
    if (isNaN(priority)) {
      setFiltersError("Priority must be a number.");
      return;
    }

    const payload = {
      name: form.name,
      priority,
      claim_filters: filters,
      role_id: form.role_id.trim() || null,
      allowed_repo_ids: parseRepoIds(form.allowed_repo_ids_raw),
      is_enabled: form.is_enabled,
    };

    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, req: payload });
    } else {
      createMutation.mutate(payload as CreateCiOidcMappingRequest);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="border-t bg-muted/30">
      <div className="px-6 py-3 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Identity Mappings
        </span>
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="size-3.5 mr-1" />
          Add Mapping
        </Button>
      </div>

      {isLoading ? (
        <div className="px-6 pb-4 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : mappings && mappings.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6 w-16">Priority</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Claim Filters</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="pl-6">
                  <Badge variant="outline" className="font-mono text-xs">
                    {m.priority}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="max-w-[280px] text-xs text-muted-foreground truncate">
                  {claimFilterSummary(m.claim_filters)}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {m.role_id ? (
                    m.role_id.slice(0, 8) + "…"
                  ) : (
                    <span className="italic">none</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={m.is_enabled ? "Active" : "Disabled"}
                    color={m.is_enabled ? "green" : "default"}
                  />
                </TableCell>
                <TableCell className="text-right pr-6">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() =>
                        toggleMutation.mutate({ id: m.id, enabled: !m.is_enabled })
                      }
                    >
                      {m.is_enabled ? (
                        <ToggleRight className="size-3.5 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="size-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(m)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="px-6 pb-6 text-center text-sm text-muted-foreground">
          <Filter className="size-6 mx-auto mb-2 text-muted-foreground/40" />
          No identity mappings yet. Add one to allow pipelines to authenticate.
        </div>
      )}

      {/* Mapping Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Identity Mapping" : "Add Identity Mapping"}
            </DialogTitle>
            <DialogDescription>
              Mappings are evaluated in priority order (lowest number first).
              The first enabled mapping whose claim filters all match the CI JWT
              wins.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-name">Name</Label>
              <Input
                id="m-name"
                placeholder="e.g. Production deploy jobs"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-priority">Priority</Label>
              <Input
                id="m-priority"
                type="number"
                min={1}
                placeholder="100"
                value={form.priority}
                onChange={(e) => setField("priority", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Lower = evaluated first. Use 10, 20, 30 … to leave room for
                reordering.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-filters">
                Claim Filters{" "}
                <span className="text-muted-foreground font-normal">(JSON)</span>
              </Label>
              <Textarea
                id="m-filters"
                rows={5}
                className="font-mono text-xs"
                placeholder={CLAIM_PLACEHOLDER[provider.provider_type]}
                value={form.claim_filters_raw}
                onChange={(e) => setField("claim_filters_raw", e.target.value)}
              />
              {filtersError && (
                <p className="text-xs text-destructive">{filtersError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Every key must match the CI JWT. Array values use any-of
                semantics:{" "}
                <code className="text-xs">{`"namespace_path": ["group-a", "group-b"]`}</code>
                . Empty object matches any valid JWT.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-role">
                Role ID{" "}
                <span className="text-muted-foreground font-normal">
                  (optional UUID)
                </span>
              </Label>
              <Input
                id="m-role"
                className="font-mono text-xs"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={form.role_id}
                onChange={(e) => setField("role_id", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                AK Role to assign to the service account for this mapping. Find
                Role UUIDs under{" "}
                <span className="font-medium">Users → Roles</span>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-repos">
                Allowed Repository IDs{" "}
                <span className="text-muted-foreground font-normal">
                  (optional, one UUID per line)
                </span>
              </Label>
              <Textarea
                id="m-repos"
                rows={3}
                className="font-mono text-xs"
                placeholder="Leave empty to allow access to all repositories."
                value={form.allowed_repo_ids_raw}
                onChange={(e) => setField("allowed_repo_ids_raw", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving || !form.name}>
              {isSaving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {editTarget ? "Save Changes" : "Create Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Identity Mapping"
        description={`Remove "${deleteTarget?.name}"? Pipelines that matched this mapping will no longer be able to authenticate.`}
        confirmText="Delete"
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CiOidcPage() {
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CiOidcProvider | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CiOidcProvider | null>(null);
  const [form, setForm] = useState<ProviderForm>(BLANK_PROVIDER_FORM);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: providers, isLoading } = useQuery({
    queryKey: ["ci-oidc"],
    queryFn: ciOidcApi.list,
  });

  const createMutation = useMutation({
    mutationFn: ciOidcApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ci-oidc"] });
      toast.success("CI OIDC provider created");
      closeDialog();
    },
    onError: mutationErrorToast("Failed to create CI OIDC provider"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCiOidcProviderRequest }) =>
      ciOidcApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ci-oidc"] });
      toast.success("CI OIDC provider updated");
      closeDialog();
    },
    onError: mutationErrorToast("Failed to update CI OIDC provider"),
  });

  const deleteMutation = useMutation({
    mutationFn: ciOidcApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ci-oidc"] });
      toast.success("CI OIDC provider deleted");
      setDeleteTarget(null);
    },
    onError: mutationErrorToast("Failed to delete CI OIDC provider"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      ciOidcApi.toggle(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ci-oidc"] }),
    onError: mutationErrorToast("Failed to toggle CI OIDC provider"),
  });

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    setForm(BLANK_PROVIDER_FORM);
  }

  function openCreate() {
    setEditTarget(null);
    setForm(BLANK_PROVIDER_FORM);
    setDialogOpen(true);
  }

  function openEdit(p: CiOidcProvider) {
    setEditTarget(p);
    setForm(providerFormFromRow(p));
    setDialogOpen(true);
  }

  function setField<K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleProviderTypeChange(t: CiOidcProviderType) {
    setForm((prev) => ({
      ...prev,
      provider_type: t,
      issuer_url: prev.issuer_url || DEFAULT_ISSUER[t],
    }));
  }

  function handleSubmit() {
    const payload = {
      name: form.name,
      provider_type: form.provider_type,
      issuer_url: form.issuer_url,
      audience: form.audience || "artifact-keeper",
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload as CreateCiOidcProviderRequest);
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CI / CD OIDC Providers"
        description="Allow CI pipelines to authenticate without static API tokens using priority-ordered identity mappings."
      />

      <Alert>
        <ShieldCheck className="size-4" />
        <AlertTitle>Identity Mapping model</AlertTitle>
        <AlertDescription>
          Each provider holds priority-ordered <strong>Identity Mappings</strong>. When a pipeline posts its CI JWT, the first enabled mapping whose claim filters all match wins — the pipeline authenticates as a stable service account with the mapping&apos;s assigned role. No static secrets required.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Configured Providers</CardTitle>
            <CardDescription>
              Expand a provider row to manage its identity mappings.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            Add Provider
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 pb-6 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : providers && providers.length > 0 ? (
            <div className="divide-y">
              {providers.map((p) => {
                const expanded = expandedIds.has(p.id);
                return (
                  <Collapsible
                    key={p.id}
                    open={expanded}
                    onOpenChange={() => toggleExpanded(p.id)}
                  >
                    <div className="flex items-center gap-3 px-6 py-3">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                        >
                          {expanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-1.5 min-w-[100px] text-sm text-muted-foreground shrink-0">
                        <ProviderTypeIcon type={p.provider_type} />
                        {PROVIDER_TYPE_LABELS[p.provider_type] ?? p.provider_type}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {p.issuer_url}
                        </p>
                      </div>

                      <Badge variant="secondary" className="text-xs shrink-0">
                        {p.mapping_count} mapping
                        {p.mapping_count !== 1 ? "s" : ""}
                      </Badge>

                      <StatusBadge
                        status={p.is_enabled ? "Active" : "Disabled"}
                        color={p.is_enabled ? "green" : "default"}
                      />

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMutation.mutate({
                              id: p.id,
                              enabled: !p.is_enabled,
                            });
                          }}
                        >
                          {p.is_enabled ? (
                            <ToggleRight className="size-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(p);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(p);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <MappingsPanel provider={p} />
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Cpu className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No CI OIDC providers configured yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={openCreate}
              >
                <Plus className="size-4 mr-1.5" />
                Add Provider
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit CI OIDC Provider" : "Add CI OIDC Provider"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update provider settings. Identity mappings are managed by expanding the provider row."
                : "Register a CI/CD identity provider. After creation, expand the row to add identity mappings."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ci-name">Name</Label>
              <Input
                id="ci-name"
                placeholder="e.g. GitLab Production"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ci-type">Provider Type</Label>
              <Select
                value={form.provider_type}
                onValueChange={(v) =>
                  handleProviderTypeChange(v as CiOidcProviderType)
                }
              >
                <SelectTrigger id="ci-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="github">GitHub Actions</SelectItem>
                  <SelectItem value="generic">Generic OIDC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ci-issuer">Issuer URL</Label>
              <Input
                id="ci-issuer"
                placeholder="https://gitlab.com"
                value={form.issuer_url}
                onChange={(e) => setField("issuer_url", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must match the <code>iss</code> claim in the CI JWT exactly.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ci-audience">Audience</Label>
              <Input
                id="ci-audience"
                placeholder="artifact-keeper"
                value={form.audience}
                onChange={(e) => setField("audience", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The <code>aud</code> claim the CI JWT must contain.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving || !form.name || !form.issuer_url}
            >
              {isSaving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {editTarget ? "Save Changes" : "Create Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provider Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete CI OIDC Provider"
        description={`This will permanently remove "${deleteTarget?.name}" and all its identity mappings. Pipelines using this provider will stop working.`}
        confirmText="Delete"
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
