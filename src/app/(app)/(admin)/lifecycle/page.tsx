"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Recycle,
  Plus,
  Play,
  Eye,
  Trash2,
  Pencil,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  lifecycleApi,
  parseLifecycleConfigError,
  withExclusions,
  type LifecycleConfigError,
} from "@/lib/api/lifecycle";
import { useLifecycleCapabilities } from "@/hooks/use-lifecycle-capabilities";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import type {
  LifecyclePolicy,
  CreateLifecyclePolicyRequest,
  UpdateLifecyclePolicyRequest,
  PolicyExclusions,
  PolicyExecutionResult,
} from "@/types/lifecycle";
import {
  POLICY_TYPE_LABELS,
  lifecycleScopeLabel,
  type PolicyType,
} from "@/types/lifecycle";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ExclusionsEditor } from "./_components/exclusions-editor";
import { PreviewResultAlert } from "./_components/preview-result-alert";
import { buildPolicyUpdate, splitPolicyConfig } from "./_components/policy-edit";
import { LifecycleCapabilityNotice } from "@/components/common/lifecycle-capability-notice";
import { Checkbox } from "@/components/ui/checkbox";

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const POLICY_CONFIG_HINTS: Record<string, string> = {
  max_age_days: '{ "days": 90 }',
  max_versions: '{ "keep": 5 }',
  no_downloads_days: '{ "days": 180 }',
  tag_pattern_keep: '{ "pattern": "^release-" }',
  tag_pattern_delete: '{ "pattern": "^snapshot-" }',
  size_quota_bytes: '{ "quota_bytes": 10737418240 }',
};

export default function LifecyclePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  // The policy being edited; the create dialog doubles as the edit dialog.
  const [editTarget, setEditTarget] = useState<LifecyclePolicy | null>(null);
  const isEdit = editTarget !== null;
  const [previewResult, setPreviewResult] =
    useState<PolicyExecutionResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LifecyclePolicy | null>(
    null
  );

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState<string>("max_age_days");
  const [formConfig, setFormConfig] = useState('{ "days": 90 }');
  const [formExclusions, setFormExclusions] = useState<PolicyExclusions>({
    versions: [],
    version_patterns: [],
  });
  // Field-level rejection of a `config` key, kept beside the toast so the
  // operator can see which control the backend refused.
  const [configError, setConfigError] = useState<LifecycleConfigError | null>(
    null
  );
  const [formAppliesToAll, setFormAppliesToAll] = useState(false);
  const [formCron, setFormCron] = useState("");
  const capabilities = useLifecycleCapabilities(!!user?.is_admin);
  const canAssign = capabilities.data === true && !capabilities.isError;

  const { data: policies, isLoading, error: policiesError, refetch: refetchPolicies } = useQuery({
    queryKey: ["lifecycle-policies"],
    queryFn: () => lifecycleApi.list(),
    enabled: !!user?.is_admin,
  });

  const createMutation = useMutation({
    mutationFn: (req: CreateLifecyclePolicyRequest) => lifecycleApi.create(req),
    onSuccess: () => {
      toast.success("Policy created");
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
      setCreateOpen(false);
      resetForm();
    },
    onError: (err) => {
      setConfigError(parseLifecycleConfigError(err));
      mutationErrorToast("Failed to create policy")(err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateLifecyclePolicyRequest }) =>
      lifecycleApi.update(id, req),
    onSuccess: () => {
      toast.success("Policy updated");
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
      setEditTarget(null);
      resetForm();
    },
    onError: (err) => {
      setConfigError(parseLifecycleConfigError(err));
      mutationErrorToast("Failed to update policy")(err);
    },
  });
  const savePending = createMutation.isPending || updateMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.delete(id),
    onSuccess: () => {
      toast.success("Policy deleted");
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
      setDeleteTarget(null);
    },
    onError: mutationErrorToast("Failed to delete policy"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      lifecycleApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast("Failed to update policy"),
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.execute(id),
    onSuccess: (result) => {
      toast.success(
        `Removed ${result.artifacts_removed} artifacts (${formatBytes(result.bytes_freed)} freed)`
      );
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast("Execution failed"),
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.preview(id),
    onSuccess: (result) => setPreviewResult(result),
    onError: mutationErrorToast("Preview failed"),
  });

  const executeAllMutation = useMutation({
    mutationFn: () => lifecycleApi.executeAll(),
    onSuccess: (results) => {
      const totalRemoved = results.reduce(
        (sum, r) => sum + r.artifacts_removed,
        0
      );
      const totalFreed = results.reduce((sum, r) => sum + r.bytes_freed, 0);
      toast.success(
        `Executed ${results.length} policies: ${totalRemoved} artifacts removed, ${formatBytes(totalFreed)} freed`
      );
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast("Execute all failed"),
  });

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormType("max_age_days");
    setFormConfig('{ "days": 90 }');
    setFormExclusions({ versions: [], version_patterns: [] });
    setConfigError(null);
    setFormAppliesToAll(false);
    setFormCron("");
  }

  function handleDialogOpenChange(open: boolean) {
    if (open) return;
    setCreateOpen(false);
    setEditTarget(null);
    resetForm();
  }

  function openEdit(policy: LifecyclePolicy) {
    const { config, exclusions } = splitPolicyConfig(policy.config);
    setFormName(policy.name);
    setFormDescription(policy.description ?? "");
    setFormType(policy.policy_type);
    setFormConfig(JSON.stringify(config, null, 2));
    setFormExclusions(exclusions);
    setConfigError(null);
    setFormAppliesToAll(policy.applies_to_all);
    setFormCron(policy.cron_schedule ?? "");
    setEditTarget(policy);
  }

  function handleSubmit() {
    if (editTarget) handleUpdate(editTarget);
    else handleCreate();
  }

  function handleUpdate(policy: LifecyclePolicy) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(formConfig);
    } catch {
      toast.error("Invalid JSON in config field");
      return;
    }
    if (policy.cron_schedule && !formCron.trim()) {
      // The backend reads a missing or null schedule as "keep", so an
      // emptied field would look saved while the old schedule kept running.
      toast.error("A cron schedule cannot be cleared once set. Enter a schedule or keep the current one.");
      return;
    }
    if (configError) setConfigError(null);
    const req = buildPolicyUpdate(policy, {
      name: formName,
      description: formDescription,
      config: withExclusions(config, formExclusions),
      cronSchedule: formCron,
      appliesToAll: formAppliesToAll,
    });
    if (Object.keys(req).length === 0) {
      handleDialogOpenChange(false);
      return;
    }
    updateMutation.mutate({ id: policy.id, req });
  }

  function handleCreate() {
    if (!canAssign) {
      toast.error("Cleanup policy assignment support must be confirmed before creation.");
      return;
    }
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(formConfig);
    } catch {
      toast.error("Invalid JSON in config field");
      return;
    }
    // Only clear a standing rejection — an unconditional reset would
    // re-render the form on every submit.
    if (configError) setConfigError(null);
    createMutation.mutate({
      name: formName,
      description: formDescription || undefined,
      policy_type: formType,
      config: withExclusions(config, formExclusions),
      applies_to_all: formAppliesToAll,
      repository_ids: [],
      ...(formCron.trim() ? { cron_schedule: formCron.trim() } : {}),
    });
  }

  function scopeHelp(): string {
    if (editTarget && formAppliesToAll !== editTarget.applies_to_all) {
      if (formAppliesToAll) {
        const count = editTarget.repository_ids.length;
        return count > 0
          ? `Saving makes this policy global and removes its ${count} explicit repository ${count === 1 ? "assignment" : "assignments"}.`
          : "Saving makes this policy global: it applies to every repository, including repositories created later.";
      }
      return "Saving makes this policy unassigned: it stops applying to every repository until attached from a repository's Settings > Cleanup Policies.";
    }
    if (editTarget && !formAppliesToAll && editTarget.repository_ids.length > 0) {
      const count = editTarget.repository_ids.length;
      return `Assigned to ${count} selected ${count === 1 ? "repository" : "repositories"}. Attach or detach repositories from their Settings > Cleanup Policies.`;
    }
    return formAppliesToAll
      ? "Global policy: cleanup applies to every repository, including repositories created later. Individual repositories cannot opt out."
      : editTarget
        ? "Unassigned: no effect until attached from a repository's Settings > Cleanup Policies."
        : "Created unassigned with no effect until attached from a repository's Settings > Cleanup Policies. You can reuse the same policy across selected repositories.";
  }

  const scopeLocked =
    !canAssign || savePending || editTarget?.scope_source === "legacy";

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Lifecycle Policies" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
        </Alert>
      </div>
    );
  }

  const enabledCount = policies?.filter((p) => p.enabled).length ?? 0;
  const lastRunPolicy = policies
    ?.filter((p) => p.last_run_at)
    .sort(
      (a, b) =>
        new Date(b.last_run_at!).getTime() - new Date(a.last_run_at!).getTime()
    )[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lifecycle Policies"
        description="Manage artifact retention and cleanup policies."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => executeAllMutation.mutate()}
              disabled={executeAllMutation.isPending || !enabledCount}
            >
              {executeAllMutation.isPending ? (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              ) : (
                <Play className="size-4 mr-1.5" />
              )}
              Execute All
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1.5" />
              New Policy
            </Button>
          </div>
        }
      />

      <LifecycleCapabilityNotice
        pending={capabilities.isPending}
        error={capabilities.error}
        onRetry={() => capabilities.refetch()}
      />
      <p className="text-sm text-muted-foreground">
        Preview and execution cover the policy&apos;s entire scope, not just one repository.
        Unassigned policies have no effect. Scope changes affect the next run, not runs already in progress.
      </p>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            icon={Recycle}
            label="Total Policies"
            value={policies?.length ?? 0}
            color="blue"
          />
          <StatCard
            icon={CheckCircle2}
            label="Enabled"
            value={enabledCount}
            color="green"
          />
          <StatCard
            icon={RefreshCw}
            label="Last Execution"
            value={
              lastRunPolicy?.last_run_at
                ? formatDateTime(lastRunPolicy.last_run_at)
                : "Never"
            }
            color="purple"
          />
        </div>
      )}

      {/* Policy Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Policies</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {isLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : policiesError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load cleanup policies</AlertTitle>
              <AlertDescription>
                {toUserMessage(policiesError, "Failed to load cleanup policies")}
                <Button variant="outline" size="sm" onClick={() => refetchPolicies()}>Retry</Button>
              </AlertDescription>
            </Alert>
          ) : !policies?.length ? (
            <div className="px-6 pb-4">
              <EmptyState
                icon={Recycle}
                title="No lifecycle policies"
                description="Create a policy to automatically manage artifact retention."
                action={
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4 mr-1.5" />
                    Create Policy
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last Run</TableHead>
                  <TableHead className="text-right">Removed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{policy.name}</div>
                        {policy.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {policy.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {POLICY_TYPE_LABELS[
                          policy.policy_type as PolicyType
                        ] ?? policy.policy_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-normal">
                        {lifecycleScopeLabel(policy)}
                      </Badge>
                      {policy.scope_source === "legacy" && (
                        <p className="text-xs text-muted-foreground">Legacy scope (read-only)</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={policy.enabled ? "enabled" : "disabled"}
                      />
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {policy.last_run_at
                        ? formatDateTime(policy.last_run_at)
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      {policy.last_run_items_removed ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            toggleMutation.mutate({
                              id: policy.id,
                              enabled: !policy.enabled,
                            })
                          }
                          aria-label={`${policy.enabled ? "Disable" : "Enable"} policy ${policy.name}`}
                        >
                          {policy.enabled ? (
                            <XCircle className="size-4" />
                          ) : (
                            <CheckCircle2 className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => previewMutation.mutate(policy.id)}
                          disabled={previewMutation.isPending}
                          aria-label={`Preview policy ${policy.name} (dry run)`}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => executeMutation.mutate(policy.id)}
                          disabled={executeMutation.isPending}
                          aria-label={`Execute policy ${policy.name}`}
                        >
                          <Play className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(policy)}
                          aria-label={`Edit policy ${policy.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(policy)}
                          aria-label={`Delete policy ${policy.name}`}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Preview Result */}
      {previewResult && <PreviewResultAlert result={previewResult} />}

      {/* Create / Edit Dialog */}
      <Dialog open={createOpen || isEdit} onOpenChange={handleDialogOpenChange}>
        {/* Bounded height + scroll: the form is taller than a short viewport
            once the exclusion lists fill up, and the footer has to stay
            reachable. Same treatment as the other admin create dialogs. */}
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit Lifecycle Policy" : "Create Lifecycle Policy"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Changes apply from the next run. Only the fields you change are saved."
                : "Define a policy to automatically clean up artifacts."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="lifecycle-name">Name</Label>
              <Input
                id="lifecycle-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Cleanup old snapshots"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-description">Description</Label>
              <Input
                id="lifecycle-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-type">Policy Type</Label>
              <Select
                value={formType}
                disabled={isEdit}
                onValueChange={(v) => {
                  setFormType(v);
                  setFormConfig(POLICY_CONFIG_HINTS[v] ?? "{}");
                }}
              >
                <SelectTrigger id="lifecycle-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                  {/* A stored type the form does not offer (e.g. composite)
                      still needs an item for the locked select to show. */}
                  {isEdit && !(formType in POLICY_TYPE_LABELS) && (
                    <SelectItem value={formType}>{formType}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {isEdit && (
                <p className="text-sm text-muted-foreground">
                  The policy type cannot be changed. Create a new policy for a different type.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="lifecycle-applies-to-all"
                  checked={formAppliesToAll}
                  onCheckedChange={(checked) => setFormAppliesToAll(checked === true)}
                  aria-describedby="lifecycle-scope-help"
                  disabled={scopeLocked}
                />
                <Label htmlFor="lifecycle-applies-to-all">
                  Automatically apply to all current and future repositories
                </Label>
              </div>
              <p id="lifecycle-scope-help" className="text-sm text-muted-foreground">
                {scopeHelp()}
              </p>
              {isEdit && editTarget?.scope_source === "legacy" && (
                <p className="text-sm text-muted-foreground">
                  This policy uses a legacy scope, which cannot be changed here.
                </p>
              )}
              {!canAssign && (
                <p role="alert" className="text-sm text-destructive">
                  {isEdit
                    ? "Scope changes are blocked until backend assignment support is confirmed."
                    : "Creation is blocked until backend assignment support is confirmed."}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-config">Config (JSON)</Label>
              <Textarea
                id="lifecycle-config"
                value={formConfig}
                onChange={(e) => setFormConfig(e.target.value)}
                className="font-mono text-sm"
                rows={isEdit ? 5 : 3}
                aria-describedby={
                  configError?.field === "config"
                    ? "lifecycle-config-error"
                    : undefined
                }
                aria-invalid={configError?.field === "config" || undefined}
              />
              {configError?.field === "config" && (
                <p
                  id="lifecycle-config-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {configError.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-cron">Schedule (cron, optional)</Label>
              <Input
                id="lifecycle-cron"
                value={formCron}
                onChange={(e) => setFormCron(e.target.value)}
                placeholder="e.g., 0 3 * * *"
                className="font-mono text-sm"
                aria-describedby="lifecycle-cron-help"
              />
              <p id="lifecycle-cron-help" className="text-sm text-muted-foreground">
                {editTarget?.cron_schedule
                  ? "Leave as is to keep the current schedule. A schedule cannot be removed once set."
                  : "Empty runs the policy on the default 6-hour cadence."}
              </p>
            </div>
            <ExclusionsEditor
              value={formExclusions}
              onChange={setFormExclusions}
              versionsError={
                configError?.field === "exclude_versions"
                  ? configError.message
                  : null
              }
              patternsError={
                configError?.field === "exclude_version_patterns"
                  ? configError.message
                  : null
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formName.trim() ||
                savePending ||
                (!isEdit && !canAssign)
              }
            >
              {savePending && (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              )}
              {isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Policy"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
