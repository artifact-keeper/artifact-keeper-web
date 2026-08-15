"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { lifecycleApi } from "@/lib/api/lifecycle";
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
  const t = useTranslations("admin.lifecycle");
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
      toast.success(t("toastCreated"));
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
      setCreateOpen(false);
      resetForm();
    },
    onError: mutationErrorToast(t("toastCreateFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.delete(id),
    onSuccess: () => {
      toast.success(t("toastDeleted"));
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
      setDeleteTarget(null);
    },
    onError: mutationErrorToast(t("toastDeleteFailed")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      lifecycleApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast(t("toastUpdateFailed")),
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.execute(id),
    onSuccess: (result) => {
      toast.success(
        t("toastExecuted", {
          count: result.artifacts_removed,
          freed: formatBytes(result.bytes_freed),
        })
      );
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast(t("toastExecuteFailed")),
  });

  const previewMutation = useMutation({
    mutationFn: (id: string) => lifecycleApi.preview(id),
    onSuccess: (result) => setPreviewResult(result),
    onError: mutationErrorToast(t("toastPreviewFailed")),
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
        t("toastExecutedAll", {
          count: results.length,
          removed: totalRemoved,
          freed: formatBytes(totalFreed),
        })
      );
      queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
    },
    onError: mutationErrorToast(t("toastExecuteAllFailed")),
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
      toast.error(t("invalidJsonError"));
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
        <PageHeader title={t("title")} />
        <Alert variant="destructive">
          <AlertTitle>{t("accessDenied")}</AlertTitle>
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
        title={t("title")}
        description={t("description")}
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
              {t("executeAll")}
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4 mr-1.5" />
              {t("newPolicy")}
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
            label={t("totalPolicies")}
            value={policies?.length ?? 0}
            color="blue"
          />
          <StatCard
            icon={CheckCircle2}
            label={t("enabled")}
            value={enabledCount}
            color="green"
          />
          <StatCard
            icon={RefreshCw}
            label={t("lastExecution")}
            value={
              lastRunPolicy?.last_run_at
                ? formatDateTime(lastRunPolicy.last_run_at)
                : t("never")
            }
            color="purple"
          />
        </div>
      )}

      {/* Policy Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("policiesTitle")}</CardTitle>
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
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                action={
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4 mr-1.5" />
                    {t("createPolicy")}
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colType")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-right">{t("colLastRun")}</TableHead>
                  <TableHead className="text-right">{t("colRemoved")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
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
                        : t("never")}
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
                          aria-label={t(policy.enabled ? "disableAria" : "enableAria", { name: policy.name })}
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
                          aria-label={t("previewAria", { name: policy.name })}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => executeMutation.mutate(policy.id)}
                          disabled={executeMutation.isPending}
                          aria-label={t("executeAria", { name: policy.name })}
                        >
                          <Play className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(policy)}
                          aria-label={t("deleteAria", { name: policy.name })}
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
            {t("previewTitle", { name: previewResult.policy_name })}
          </AlertTitle>
          <AlertDescription>
            {t("previewDescription", {
              matched: previewResult.artifacts_matched,
              removed: previewResult.artifacts_removed,
              freed: formatBytes(previewResult.bytes_freed),
            })}
            {previewResult.errors.length > 0 && (
              <span className="text-destructive">
                {" "}
                {t("previewErrors", { count: previewResult.errors.length })}.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("createDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="lifecycle-name">{t("nameLabel")}</Label>
              <Input
                id="lifecycle-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-description">{t("descriptionLabel")}</Label>
              <Input
                id="lifecycle-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lifecycle-type">{t("policyTypeLabel")}</Label>
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
                <Label htmlFor="lifecycle-repository">{t("repositoryLabel")}</Label>
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
                      aria-label={t("repositoryLabel")}
                      aria-expanded={repositoryPickerOpen}
                      className="w-full justify-between font-normal"
                      disabled={isLoadingRepositories}
                    >
                      {isLoadingRepositories
                        ? t("loadingRepositories")
                        : selectedRepository
                          ? `${selectedRepository.key} (${selectedRepository.format}, ${selectedRepository.repo_type})`
                          : t("selectRepository")}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        aria-label={t("searchRepositoriesAria")}
                        placeholder={t("searchRepositoriesPlaceholder")}
                        value={repositorySearch}
                        onValueChange={setRepositorySearch}
                      />
                      <CommandList>
                        {filteredRepositories.length === 0 && (
                          <CommandEmpty>
                            {t("noRepositoriesMatch")}
                          </CommandEmpty>
                        )}
                        {filteredRepositories.length > 0 && (
                          <CommandGroup heading={t("repositoriesHeading")}>
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
                  {t("repositoryRequiredHint")}
                </p>
                {repositoriesError && (
                  <p className="text-xs text-destructive">
                    {t("repositoriesLoadError")}
                  </p>
                )}
                {!isLoadingRepositories && !repositoriesError && repositories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("noRepositoriesAvailable")}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="lifecycle-config">{t("configLabel")}</Label>
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
              {t("cancel")}
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
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: deleteTarget?.name ?? "" })}
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
