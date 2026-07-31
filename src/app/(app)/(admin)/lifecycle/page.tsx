"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Recycle,
  Plus,
  Play,
  Eye,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Check,
  ChevronsUpDown,
  XCircle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import lifecycleApi from "@/lib/api/lifecycle";
import { useRepositories } from "@/hooks/use-repositories";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes } from "@/lib/utils";
import type {
  LifecyclePolicy,
  CreateLifecyclePolicyRequest,
  PolicyExecutionResult,
} from "@/types/lifecycle";
import {
  POLICY_TYPE_LABELS,
  policyTypeRequiresRepositoryId,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  size_quota_bytes: '{ "max_bytes": 10737418240 }',
};

export default function LifecyclePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
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
  const [formRepositoryId, setFormRepositoryId] = useState("");
  const [repositoryPickerOpen, setRepositoryPickerOpen] = useState(false);
  const [repositorySearch, setRepositorySearch] = useState("");
  const requiresRepositoryId = policyTypeRequiresRepositoryId(formType);

  const { data: policies, isLoading } = useQuery({
    queryKey: ["lifecycle-policies"],
    queryFn: () => lifecycleApi.list(),
    enabled: !!user?.is_admin,
  });

  const {
    data: repositoriesPage,
    isLoading: isLoadingRepositories,
    isError: repositoriesError,
  } = useRepositories(
    { per_page: 1000 },
    { enabled: !!user?.is_admin && createOpen && requiresRepositoryId },
  );

  const repositories = useMemo(
    () => repositoriesPage?.items ?? [],
    [repositoriesPage?.items]
  );
  const selectedRepository = useMemo(
    () => repositories.find((repository) => repository.id === formRepositoryId),
    [formRepositoryId, repositories]
  );
  const filteredRepositories = useMemo(() => {
    const search = repositorySearch.trim().toLowerCase();
    if (!search) return repositories;

    return repositories.filter((repository) =>
      [
        repository.key,
        repository.name,
        repository.format,
        repository.repo_type,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }, [repositories, repositorySearch]);

  const createMutation = useMutation({
    mutationFn: (req: CreateLifecyclePolicyRequest) => lifecycleApi.create(req),
    onSuccess: () => {
      toast.success("Policy created");
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
      setCreateOpen(false);
      resetForm();
    },
    onError: mutationErrorToast("Failed to create policy"),
  });

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
    setFormRepositoryId("");
    setRepositoryPickerOpen(false);
    setRepositorySearch("");
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setRepositoryPickerOpen(false);
      setRepositorySearch("");
    }
  }

  function handleCreate() {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(formConfig);
    } catch {
      toast.error("Invalid JSON in config field");
      return;
    }
    createMutation.mutate({
      name: formName,
      description: formDescription || undefined,
      policy_type: formType,
      config,
      repository_id: requiresRepositoryId ? formRepositoryId : undefined,
    });
  }

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
      {previewResult && (
        <Alert>
          <Eye className="size-4" />
          <AlertTitle>
            Preview: {previewResult.policy_name}
          </AlertTitle>
          <AlertDescription>
            Would match {previewResult.artifacts_matched} artifacts, remove{" "}
            {previewResult.artifacts_removed}, free{" "}
            {formatBytes(previewResult.bytes_freed)}.
            {previewResult.errors.length > 0 && (
              <span className="text-destructive">
                {" "}
                {previewResult.errors.length} error(s).
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Lifecycle Policy</DialogTitle>
            <DialogDescription>
              Define a policy to automatically clean up artifacts.
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
                onValueChange={(v) => {
                  setFormType(v);
                  setFormConfig(POLICY_CONFIG_HINTS[v] ?? "{}");
                  if (!policyTypeRequiresRepositoryId(v)) {
                    setFormRepositoryId("");
                    setRepositoryPickerOpen(false);
                    setRepositorySearch("");
                  }
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
                </SelectContent>
              </Select>
            </div>
            {requiresRepositoryId && (
              <div className="space-y-2">
                <Label htmlFor="lifecycle-repository">Repository</Label>
                <Popover
                  open={repositoryPickerOpen}
                  onOpenChange={(open) => {
                    setRepositoryPickerOpen(open);
                    if (!open) setRepositorySearch("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      id="lifecycle-repository"
                      variant="outline"
                      role="combobox"
                      aria-label="Repository"
                      aria-expanded={repositoryPickerOpen}
                      className="w-full justify-between font-normal"
                      disabled={isLoadingRepositories}
                    >
                      {isLoadingRepositories
                        ? "Loading repositories..."
                        : selectedRepository
                          ? `${selectedRepository.key} (${selectedRepository.format}, ${selectedRepository.repo_type})`
                          : "Select a repository"}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        aria-label="Search repositories"
                        placeholder="Search repositories..."
                        value={repositorySearch}
                        onValueChange={setRepositorySearch}
                      />
                      <CommandList>
                        {filteredRepositories.length === 0 && (
                          <CommandEmpty>
                            No repositories match your search.
                          </CommandEmpty>
                        )}
                        {filteredRepositories.length > 0 && (
                          <CommandGroup heading="Repositories">
                            {filteredRepositories.map((repository) => (
                              <CommandItem
                                key={repository.id}
                                value={repository.id}
                                onSelect={() => {
                                  setFormRepositoryId(repository.id);
                                  setRepositoryPickerOpen(false);
                                  setRepositorySearch("");
                                }}
                              >
                                <Check
                                  className={`size-4 ${
                                    formRepositoryId === repository.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  }`}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {repository.key}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {repository.format}, {repository.repo_type}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  Required for Max Versions and Size Quota policies.
                </p>
                {repositoriesError && (
                  <p className="text-xs text-destructive">
                    Couldn&apos;t load repositories. Close and reopen this dialog
                    to retry.
                  </p>
                )}
                {!isLoadingRepositories && !repositoriesError && repositories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No repositories are available.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="lifecycle-config">Config (JSON)</Label>
              <Textarea
                id="lifecycle-config"
                value={formConfig}
                onChange={(e) => setFormConfig(e.target.value)}
                className="font-mono text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !formName ||
                createMutation.isPending ||
                (requiresRepositoryId &&
                  (!formRepositoryId || isLoadingRepositories))
              }
            >
              {createMutation.isPending && (
                <Loader2 className="size-4 mr-1.5 animate-spin" />
              )}
              Create
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
