"use client";

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import securityApi from "@/lib/api/security";
import type {
  ScanPolicy,
  CreatePolicyRequest,
  UpdatePolicyRequest,
} from "@/types/security";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";

// -- severity colors --

const SEVERITY_BADGE: Record<string, string> = {
  critical:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  medium:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
};

const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// -- form state types --

interface PolicyFormState {
  name: string;
  max_severity: string;
  block_unscanned: boolean;
  block_on_fail: boolean;
  is_enabled: boolean;
  repository_id: string;
}

const DEFAULT_FORM: PolicyFormState = {
  name: "",
  max_severity: "high",
  block_unscanned: false,
  block_on_fail: false,
  is_enabled: true,
  repository_id: "",
};

// -- shared form fields (extracted to avoid react-hooks/static-components) --

function PolicyFormFields({
  form,
  setForm,
  showEnabled,
  showRepoId,
}: {
  form: PolicyFormState;
  setForm: React.Dispatch<React.SetStateAction<PolicyFormState>>;
  showEnabled?: boolean;
  showRepoId?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="policy-name">Policy Name</Label>
        <Input
          id="policy-name"
          placeholder="e.g., Block Critical CVEs"
          value={form.name}
          onChange={(e) =>
            setForm((f) => ({ ...f, name: e.target.value }))
          }
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Max Severity Threshold</Label>
        <Select
          value={form.max_severity}
          onValueChange={(v) =>
            setForm((f) => ({ ...f, max_severity: v }))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Block artifacts with findings at or above this severity.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="block-unscanned"
          checked={form.block_unscanned}
          onCheckedChange={(v) =>
            setForm((f) => ({ ...f, block_unscanned: v }))
          }
        />
        <Label htmlFor="block-unscanned" className="text-sm">
          Block unscanned artifacts
        </Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="block-on-fail"
          checked={form.block_on_fail}
          onCheckedChange={(v) =>
            setForm((f) => ({ ...f, block_on_fail: v }))
          }
        />
        <Label htmlFor="block-on-fail" className="text-sm">
          Block on scan failure
        </Label>
      </div>
      {showEnabled && (
        <div className="flex items-center gap-3">
          <Switch
            id="policy-enabled"
            checked={form.is_enabled}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, is_enabled: v }))
            }
          />
          <Label htmlFor="policy-enabled" className="text-sm">
            Policy enabled
          </Label>
        </div>
      )}
      {showRepoId && (
        <div className="space-y-2">
          <Label htmlFor="policy-repo-id">
            Repository ID (optional)
          </Label>
          <Input
            id="policy-repo-id"
            placeholder="Leave blank for a global policy"
            value={form.repository_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, repository_id: e.target.value }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Scope this policy to a specific repository, or leave blank for
            global enforcement.
          </p>
        </div>
      )}
    </div>
  );
}

export default function SecurityPoliciesPage() {
  const queryClient = useQueryClient();

  // -- modal state --
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<ScanPolicy | null>(
    null
  );

  const [createForm, setCreateForm] = useState<PolicyFormState>({
    ...DEFAULT_FORM,
  });
  const [editForm, setEditForm] = useState<PolicyFormState>({
    ...DEFAULT_FORM,
  });

  // -- queries --
  const { data: policies, isLoading } = useQuery({
    queryKey: ["security", "policies"],
    queryFn: securityApi.listPolicies,
  });

  // -- mutations --
  const createMutation = useMutation({
    mutationFn: (req: CreatePolicyRequest) => securityApi.createPolicy(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security", "policies"] });
      setCreateOpen(false);
      setCreateForm({ ...DEFAULT_FORM });
      toast.success("Policy created.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdatePolicyRequest }) =>
      securityApi.updatePolicy(id, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security", "policies"] });
      setEditOpen(false);
      setSelectedPolicy(null);
      toast.success("Policy updated.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: securityApi.deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security", "policies"] });
      setDeleteOpen(false);
      setSelectedPolicy(null);
      toast.success("Policy deleted.");
    },
  });

  const handleEdit = useCallback((policy: ScanPolicy) => {
    setSelectedPolicy(policy);
    setEditForm({
      name: policy.name,
      max_severity: policy.max_severity,
      block_unscanned: policy.block_unscanned,
      block_on_fail: policy.block_on_fail,
      is_enabled: policy.is_enabled,
      repository_id: policy.repository_id ?? "",
    });
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback((policy: ScanPolicy) => {
    setSelectedPolicy(policy);
    setDeleteOpen(true);
  }, []);

  // -- table columns --
  const columns: DataTableColumn<ScanPolicy>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (r) => r.name,
      sortable: true,
      cell: (r) => <span className="text-sm font-medium">{r.name}</span>,
    },
    {
      id: "scope",
      header: "Scope",
      accessor: (r) => (r.repository_id ? "repo" : "global"),
      cell: (r) =>
        r.repository_id ? (
          <Badge variant="secondary" className="text-xs font-normal">
            Repo: {r.repository_id.slice(0, 8)}...
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800 text-xs font-medium"
          >
            Global
          </Badge>
        ),
    },
    {
      id: "max_severity",
      header: "Severity Threshold",
      accessor: (r) => r.max_severity,
      cell: (r) => (
        <Badge
          variant="outline"
          className={`border font-semibold uppercase text-xs ${SEVERITY_BADGE[r.max_severity] ?? ""}`}
        >
          {r.max_severity}
        </Badge>
      ),
    },
    {
      id: "block_unscanned",
      header: "Block Unscanned",
      cell: (r) =>
        r.block_unscanned ? (
          <Badge
            variant="outline"
            className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-xs font-medium"
          >
            Yes
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">No</span>
        ),
    },
    {
      id: "block_on_fail",
      header: "Block on Fail",
      cell: (r) =>
        r.block_on_fail ? (
          <Badge
            variant="outline"
            className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-xs font-medium"
          >
            Yes
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">No</span>
        ),
    },
    {
      id: "enabled",
      header: "Enabled",
      accessor: (r) => (r.is_enabled ? "yes" : "no"),
      cell: (r) =>
        r.is_enabled ? (
          <Badge
            variant="outline"
            className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-xs font-medium"
          >
            Active
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs font-normal">
            Disabled
          </Badge>
        ),
    },
    {
      id: "created_at",
      header: "Created",
      accessor: (r) => r.created_at,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {new Date(r.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (r) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleEdit(r)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(r)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Policies"
        description="Define enforcement rules that control which artifacts can be downloaded based on scan results."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create Policy
          </Button>
        }
      />

      {/* Data table */}
      <DataTable
        columns={columns}
        data={policies ?? []}
        loading={isLoading}
        emptyMessage="No security policies defined yet."
        rowKey={(r) => r.id}
      />

      {/* Create Policy Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setCreateForm({ ...DEFAULT_FORM });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Security Policy</DialogTitle>
            <DialogDescription>
              Define a new policy to enforce security requirements on artifact
              downloads.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name: createForm.name,
                max_severity: createForm.max_severity,
                block_unscanned: createForm.block_unscanned,
                block_on_fail: createForm.block_on_fail,
                repository_id: createForm.repository_id || null,
              });
            }}
          >
            <PolicyFormFields
              form={createForm}
              setForm={setCreateForm}
              showRepoId
            />
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setCreateForm({ ...DEFAULT_FORM });
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !createForm.name.trim() || createMutation.isPending
                }
              >
                {createMutation.isPending ? "Creating..." : "Create Policy"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Policy Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setSelectedPolicy(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Policy</DialogTitle>
            <DialogDescription>
              Update the enforcement rules for this security policy.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedPolicy) {
                updateMutation.mutate({
                  id: selectedPolicy.id,
                  req: {
                    name: editForm.name,
                    max_severity: editForm.max_severity,
                    block_unscanned: editForm.block_unscanned,
                    block_on_fail: editForm.block_on_fail,
                    is_enabled: editForm.is_enabled,
                  },
                });
              }
            }}
          >
            <PolicyFormFields
              form={editForm}
              setForm={setEditForm}
              showEnabled
            />
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedPolicy(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !editForm.name.trim() || updateMutation.isPending
                }
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedPolicy(null);
        }}
        title="Delete Policy"
        description={`Are you sure you want to delete the policy "${selectedPolicy?.name}"? This action cannot be undone.`}
        confirmText="Delete Policy"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedPolicy) {
            deleteMutation.mutate(selectedPolicy.id);
          }
        }}
      />
    </div>
  );
}
