"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Award,
  AlertTriangle,
  Loader2,
  Activity,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import qualityGatesApi from "@/lib/api/quality-gates";
import type {
  QualityGate,
  CreateQualityGateRequest,
  UpdateQualityGateRequest,
  HealthDashboard,
} from "@/types/quality-gates";
import { ACTION_COLORS, GRADE_COLORS, CHECK_TYPES, CHECK_TYPE_LABELS } from "@/types/quality-gates";

import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

// -- Gate form state --

interface GateFormState {
  name: string;
  description: string;
  min_health_score: string;
  min_security_score: string;
  min_quality_score: string;
  min_metadata_score: string;
  max_critical_issues: string;
  max_high_issues: string;
  max_medium_issues: string;
  required_checks: string[];
  enforce_on_promotion: boolean;
  enforce_on_download: boolean;
  action: string;
}

const emptyForm: GateFormState = {
  name: "",
  description: "",
  min_health_score: "",
  min_security_score: "",
  min_quality_score: "",
  min_metadata_score: "",
  max_critical_issues: "",
  max_high_issues: "",
  max_medium_issues: "",
  required_checks: [],
  enforce_on_promotion: true,
  enforce_on_download: false,
  action: "warn",
};

function gateToForm(gate: QualityGate): GateFormState {
  return {
    name: gate.name,
    description: gate.description ?? "",
    min_health_score: gate.min_health_score != null ? String(gate.min_health_score) : "",
    min_security_score: gate.min_security_score != null ? String(gate.min_security_score) : "",
    min_quality_score: gate.min_quality_score != null ? String(gate.min_quality_score) : "",
    min_metadata_score: gate.min_metadata_score != null ? String(gate.min_metadata_score) : "",
    max_critical_issues: gate.max_critical_issues != null ? String(gate.max_critical_issues) : "",
    max_high_issues: gate.max_high_issues != null ? String(gate.max_high_issues) : "",
    max_medium_issues: gate.max_medium_issues != null ? String(gate.max_medium_issues) : "",
    required_checks: gate.required_checks ?? [],
    enforce_on_promotion: gate.enforce_on_promotion,
    enforce_on_download: gate.enforce_on_download,
    action: gate.action,
  };
}

function formToCreateRequest(form: GateFormState): CreateQualityGateRequest {
  return {
    name: form.name,
    description: form.description || undefined,
    min_health_score: form.min_health_score ? Number(form.min_health_score) : undefined,
    min_security_score: form.min_security_score ? Number(form.min_security_score) : undefined,
    min_quality_score: form.min_quality_score ? Number(form.min_quality_score) : undefined,
    min_metadata_score: form.min_metadata_score ? Number(form.min_metadata_score) : undefined,
    max_critical_issues: form.max_critical_issues ? Number(form.max_critical_issues) : undefined,
    max_high_issues: form.max_high_issues ? Number(form.max_high_issues) : undefined,
    max_medium_issues: form.max_medium_issues ? Number(form.max_medium_issues) : undefined,
    required_checks: form.required_checks.length > 0 ? form.required_checks : undefined,
    enforce_on_promotion: form.enforce_on_promotion,
    enforce_on_download: form.enforce_on_download,
    action: form.action,
  };
}

function formToUpdateRequest(form: GateFormState): UpdateQualityGateRequest {
  return {
    name: form.name,
    description: form.description || undefined,
    min_health_score: form.min_health_score ? Number(form.min_health_score) : null,
    min_security_score: form.min_security_score ? Number(form.min_security_score) : null,
    min_quality_score: form.min_quality_score ? Number(form.min_quality_score) : null,
    min_metadata_score: form.min_metadata_score ? Number(form.min_metadata_score) : null,
    max_critical_issues: form.max_critical_issues ? Number(form.max_critical_issues) : null,
    max_high_issues: form.max_high_issues ? Number(form.max_high_issues) : null,
    max_medium_issues: form.max_medium_issues ? Number(form.max_medium_issues) : null,
    required_checks: form.required_checks,
    enforce_on_promotion: form.enforce_on_promotion,
    enforce_on_download: form.enforce_on_download,
    action: form.action,
  };
}

// -- Grade badge --

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-2.5 py-0.5 text-sm font-bold ${GRADE_COLORS[grade] ?? "bg-muted text-muted-foreground"}`}
    >
      {grade}
    </span>
  );
}

// -- Health Grade Distribution Bar --

function GradeDistributionBar({ dashboard }: { dashboard: HealthDashboard }) {
  const grades = [
    { label: "A", count: dashboard.repos_grade_a, color: "bg-emerald-500" },
    { label: "B", count: dashboard.repos_grade_b, color: "bg-blue-500" },
    { label: "C", count: dashboard.repos_grade_c, color: "bg-amber-500" },
    { label: "D", count: dashboard.repos_grade_d, color: "bg-orange-500" },
    { label: "F", count: dashboard.repos_grade_f, color: "bg-red-500" },
  ];
  const total = grades.reduce((s, g) => s + g.count, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {grades.map((g) =>
          g.count > 0 ? (
            <div
              key={g.label}
              className={`${g.color} transition-all`}
              style={{ width: `${(g.count / total) * 100}%` }}
              title={`Grade ${g.label}: ${g.count}`}
            />
          ) : null
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {grades.map((g) => (
          <div key={g.label} className="flex items-center gap-1.5">
            <div className={`size-2.5 rounded-full ${g.color}`} />
            <span>
              {g.label}: {g.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Gate Form Dialog --

function GateFormDialog({
  open,
  onOpenChange,
  title,
  description,
  form,
  setForm,
  onSubmit,
  loading,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  form: GateFormState;
  setForm: (form: GateFormState) => void;
  onSubmit: () => void;
  loading: boolean;
  submitLabel: string;
}) {
  const toggleCheck = (check: string) => {
    setForm({
      ...form,
      required_checks: form.required_checks.includes(check)
        ? form.required_checks.filter((c) => c !== check)
        : [...form.required_checks, check],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Production Release Gate"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>

          {/* Score Thresholds */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Minimum Score Thresholds (0-100)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Health Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.min_health_score}
                  onChange={(e) => setForm({ ...form, min_health_score: e.target.value })}
                  placeholder="--"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Security Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.min_security_score}
                  onChange={(e) => setForm({ ...form, min_security_score: e.target.value })}
                  placeholder="--"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Quality Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.min_quality_score}
                  onChange={(e) => setForm({ ...form, min_quality_score: e.target.value })}
                  placeholder="--"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Metadata Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.min_metadata_score}
                  onChange={(e) => setForm({ ...form, min_metadata_score: e.target.value })}
                  placeholder="--"
                />
              </div>
            </div>
          </div>

          {/* Max Issues */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Maximum Issue Counts</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Critical</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.max_critical_issues}
                  onChange={(e) => setForm({ ...form, max_critical_issues: e.target.value })}
                  placeholder="--"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">High</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.max_high_issues}
                  onChange={(e) => setForm({ ...form, max_high_issues: e.target.value })}
                  placeholder="--"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Medium</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.max_medium_issues}
                  onChange={(e) => setForm({ ...form, max_medium_issues: e.target.value })}
                  placeholder="--"
                />
              </div>
            </div>
          </div>

          {/* Required Checks */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Required Checks</Label>
            <div className="grid grid-cols-2 gap-2">
              {CHECK_TYPES.map((check) => (
                <label
                  key={check}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={form.required_checks.includes(check)}
                    onCheckedChange={() => toggleCheck(check)}
                  />
                  <span className="text-sm">
                    {CHECK_TYPE_LABELS[check] ?? check}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Action */}
          <div className="space-y-2">
            <Label>Action When Gate Fails</Label>
            <Select
              value={form.action}
              onValueChange={(v) => setForm({ ...form, action: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow (log only)</SelectItem>
                <SelectItem value="warn">Warn (proceed with warning)</SelectItem>
                <SelectItem value="block">Block (prevent action)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Enforcement */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Enforcement</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Enforce on Promotion</p>
                  <p className="text-xs text-muted-foreground">
                    Evaluate this gate when artifacts are promoted
                  </p>
                </div>
                <Switch
                  checked={form.enforce_on_promotion}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, enforce_on_promotion: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Enforce on Download</p>
                  <p className="text-xs text-muted-foreground">
                    Evaluate this gate when artifacts are downloaded
                  </p>
                </div>
                <Switch
                  checked={form.enforce_on_download}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, enforce_on_download: checked })
                  }
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.name || loading}
          >
            {loading && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -- Main page --

export default function QualityGatesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QualityGate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QualityGate | null>(null);
  const [createForm, setCreateForm] = useState<GateFormState>(emptyForm);
  const [editForm, setEditForm] = useState<GateFormState>(emptyForm);

  // -- Queries --
  const { data: gates, isLoading: gatesLoading } = useQuery({
    queryKey: ["quality-gates"],
    queryFn: () => qualityGatesApi.listGates(),
    enabled: !!user?.is_admin,
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ["quality-health-dashboard"],
    queryFn: () => qualityGatesApi.getHealthDashboard(),
    enabled: !!user?.is_admin,
  });

  // -- Mutations --
  const createMutation = useMutation({
    mutationFn: (req: CreateQualityGateRequest) => qualityGatesApi.createGate(req),
    onSuccess: () => {
      toast.success("Quality gate created");
      queryClient.invalidateQueries({ queryKey: ["quality-gates"] });
      setCreateOpen(false);
      setCreateForm(emptyForm);
    },
    onError: () => toast.error("Failed to create quality gate"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateQualityGateRequest }) =>
      qualityGatesApi.updateGate(id, req),
    onSuccess: () => {
      toast.success("Quality gate updated");
      queryClient.invalidateQueries({ queryKey: ["quality-gates"] });
      setEditTarget(null);
    },
    onError: () => toast.error("Failed to update quality gate"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => qualityGatesApi.deleteGate(id),
    onSuccess: () => {
      toast.success("Quality gate deleted");
      queryClient.invalidateQueries({ queryKey: ["quality-gates"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("Failed to delete quality gate"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_enabled }: { id: string; is_enabled: boolean }) =>
      qualityGatesApi.updateGate(id, { is_enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality-gates"] });
    },
    onError: () => toast.error("Failed to update quality gate"),
  });

  // -- Helpers --
  function openEdit(gate: QualityGate) {
    setEditForm(gateToForm(gate));
    setEditTarget(gate);
  }

  function handleCreate() {
    createMutation.mutate(formToCreateRequest(createForm));
  }

  function handleUpdate() {
    if (!editTarget) return;
    updateMutation.mutate({
      id: editTarget.id,
      req: formToUpdateRequest(editForm),
    });
  }

  // -- Access check --
  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Quality Gates" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
        </Alert>
      </div>
    );
  }

  const enabledCount = gates?.filter((g) => g.is_enabled).length ?? 0;
  const blockCount = gates?.filter((g) => g.action === "block").length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quality Gates"
        description="Define quality thresholds that artifacts must pass before promotion or download."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["quality-gates"] });
                queryClient.invalidateQueries({ queryKey: ["quality-health-dashboard"] });
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCreateForm(emptyForm);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4 mr-1.5" />
              New Gate
            </Button>
          </div>
        }
      />

      {/* Health Dashboard Stats */}
      {dashLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : dashboard ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={Activity}
              label="Avg Health Score"
              value={`${dashboard.avg_health_score}/100`}
              color={dashboard.avg_health_score >= 70 ? "green" : dashboard.avg_health_score >= 40 ? "yellow" : "red"}
            />
            <StatCard
              icon={BarChart3}
              label="Artifacts Evaluated"
              value={dashboard.total_artifacts_evaluated}
              color="blue"
            />
            <StatCard
              icon={Award}
              label="Grade A Repos"
              value={dashboard.repos_grade_a}
              color="green"
            />
            <StatCard
              icon={AlertTriangle}
              label="Grade F Repos"
              value={dashboard.repos_grade_f}
              color={dashboard.repos_grade_f > 0 ? "red" : "green"}
            />
          </div>

          {/* Grade Distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Repository Grade Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <GradeDistributionBar dashboard={dashboard} />
            </CardContent>
          </Card>

          {/* Repository Health Table */}
          {dashboard.repositories.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Repository Health</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Repository</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead className="text-right">Evaluated</TableHead>
                      <TableHead className="text-right">Passing</TableHead>
                      <TableHead className="text-right">Failing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.repositories.map((repo) => (
                      <TableRow key={repo.repository_id}>
                        <TableCell>
                          <code className="text-xs">{repo.repository_key}</code>
                        </TableCell>
                        <TableCell>
                          <GradeBadge grade={repo.health_grade} />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">
                            {repo.health_score}/100
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {repo.artifacts_evaluated}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm text-emerald-600 dark:text-emerald-400">
                            {repo.artifacts_passing}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm ${repo.artifacts_failing > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                            {repo.artifacts_failing}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      {/* Gate Stats */}
      {gatesLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            icon={ShieldCheck}
            label="Total Gates"
            value={gates?.length ?? 0}
            color="blue"
          />
          <StatCard
            icon={CheckCircle2}
            label="Enabled"
            value={enabledCount}
            color="green"
          />
          <StatCard
            icon={AlertTriangle}
            label="Blocking"
            value={blockCount}
            color={blockCount > 0 ? "red" : "default"}
          />
        </div>
      )}

      {/* Quality Gates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quality Gates</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {gatesLoading ? (
            <div className="space-y-2 px-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !gates?.length ? (
            <div className="px-6 pb-4">
              <EmptyState
                icon={ShieldCheck}
                title="No quality gates"
                description="Create a quality gate to enforce minimum standards for your artifacts."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setCreateForm(emptyForm);
                      setCreateOpen(true);
                    }}
                  >
                    <Plus className="size-4 mr-1.5" />
                    Create Gate
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Thresholds</TableHead>
                  <TableHead>Enforcement</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gates.map((gate) => (
                  <TableRow key={gate.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{gate.name}</div>
                        {gate.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {gate.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`border font-semibold uppercase text-xs ${ACTION_COLORS[gate.action] ?? ""}`}
                      >
                        {gate.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {gate.min_health_score != null && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Health {"\u2265"} {gate.min_health_score}
                          </Badge>
                        )}
                        {gate.min_security_score != null && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Security {"\u2265"} {gate.min_security_score}
                          </Badge>
                        )}
                        {gate.min_quality_score != null && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Quality {"\u2265"} {gate.min_quality_score}
                          </Badge>
                        )}
                        {gate.min_metadata_score != null && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Metadata {"\u2265"} {gate.min_metadata_score}
                          </Badge>
                        )}
                        {gate.max_critical_issues != null && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Critical {"\u2264"} {gate.max_critical_issues}
                          </Badge>
                        )}
                        {gate.max_high_issues != null && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            High {"\u2264"} {gate.max_high_issues}
                          </Badge>
                        )}
                        {gate.max_medium_issues != null && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Medium {"\u2264"} {gate.max_medium_issues}
                          </Badge>
                        )}
                        {gate.min_health_score == null &&
                         gate.min_security_score == null &&
                         gate.min_quality_score == null &&
                         gate.min_metadata_score == null &&
                         gate.max_critical_issues == null &&
                         gate.max_high_issues == null &&
                         gate.max_medium_issues == null && (
                          <span className="text-xs text-muted-foreground">
                            No thresholds set
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {gate.enforce_on_promotion && (
                          <Badge variant="outline" className="text-xs font-normal">
                            Promotion
                          </Badge>
                        )}
                        {gate.enforce_on_download && (
                          <Badge variant="outline" className="text-xs font-normal">
                            Download
                          </Badge>
                        )}
                        {!gate.enforce_on_promotion && !gate.enforce_on_download && (
                          <span className="text-xs text-muted-foreground">
                            None
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={gate.is_enabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({
                            id: gate.id,
                            is_enabled: checked,
                          })
                        }
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(gate)}
                          title="Edit"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(gate)}
                          title="Delete"
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

      {/* Create Dialog */}
      <GateFormDialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setCreateForm(emptyForm);
        }}
        title="Create Quality Gate"
        description="Define thresholds that artifacts must pass."
        form={createForm}
        setForm={setCreateForm}
        onSubmit={handleCreate}
        loading={createMutation.isPending}
        submitLabel="Create"
      />

      {/* Edit Dialog */}
      <GateFormDialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
        title="Edit Quality Gate"
        description="Update the quality gate settings."
        form={editForm}
        setForm={setEditForm}
        onSubmit={handleUpdate}
        loading={updateMutation.isPending}
        submitLabel="Save Changes"
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Quality Gate"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        danger
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
