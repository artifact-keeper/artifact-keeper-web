"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useLifecycleCapabilities } from "@/hooks/use-lifecycle-capabilities";
import { lifecycleApi } from "@/lib/api/lifecycle";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { lifecycleScopeLabel, POLICY_TYPE_LABELS, type LifecyclePolicy, type PolicyType } from "@/types/lifecycle";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { LifecycleCapabilityNotice } from "@/components/common/lifecycle-capability-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CleanupPolicySettings({ repositoryId }: { repositoryId: string }) {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const queryClient = useQueryClient();
  const capabilities = useLifecycleCapabilities(isAdmin);
  const canAssign = isAdmin && capabilities.data === true && !capabilities.isError;
  const [selectedId, setSelectedId] = useState("");
  const [detachTarget, setDetachTarget] = useState<LifecyclePolicy | null>(null);
  const effective = useQuery({
    queryKey: ["lifecycle-policies", repositoryId],
    queryFn: () => lifecycleApi.list({ repository_id: repositoryId }),
    enabled: isAdmin && !!repositoryId,
  });
  const available = useQuery({
    queryKey: ["lifecycle-policies"],
    queryFn: () => lifecycleApi.list(),
    enabled: canAssign && !!repositoryId,
  });
  const candidates = (available.data ?? []).filter(
    (policy) =>
      policy.scope_source === "explicit" &&
      !policy.applies_to_all &&
      !policy.repository_ids.includes(repositoryId) &&
      !effective.data?.some((assigned) => assigned.id === policy.id)
  );
  const selectedPolicy = candidates.find((policy) => policy.id === selectedId);
  const invalidatePolicies = () =>
    queryClient.invalidateQueries({ queryKey: ["lifecycle-policies"] });
  const attach = useMutation({
    mutationFn: (id: string) => lifecycleApi.attach(id, repositoryId),
    onSuccess: async () => {
      setSelectedId("");
      await invalidatePolicies();
      toast.success("Cleanup policy attached for future runs");
    },
    onError: mutationErrorToast("Failed to attach cleanup policy"),
  });
  const detach = useMutation({
    mutationFn: (id: string) => lifecycleApi.detach(id, repositoryId),
    onSuccess: async () => {
      setDetachTarget(null);
      await invalidatePolicies();
      toast.success("Cleanup policy detached for future runs");
    },
    onError: mutationErrorToast("Failed to detach cleanup policy"),
  });
  const busy = attach.isPending || detach.isPending;
  const canChange = canAssign && !effective.isError && !effective.isPending && !busy;

  return (
    <section aria-labelledby="settings-cleanup-heading" className="space-y-4">
      <div>
        <h3 id="settings-cleanup-heading" className="text-base font-semibold">Cleanup Policies</h3>
        <p className="text-sm text-muted-foreground">
          Policies that apply to this repository. Assignment changes affect the next run;
          they do not cancel cleanup already in progress.
        </p>
      </div>
      {!isAdmin ? (
        <p className="text-sm text-muted-foreground">Administrator access is required to view and manage cleanup policies.</p>
      ) : (
        <>
          <LifecycleCapabilityNotice
            pending={capabilities.isPending}
            error={capabilities.error}
            onRetry={() => capabilities.refetch()}
          />
          <p className="text-sm text-muted-foreground">
            <Link href="/lifecycle" className="text-primary underline">Manage policies in Lifecycle administration</Link>
            {" "}to create, preview, execute or delete a policy across its entire scope.
          </p>
          {effective.isPending ? (
            <Skeleton className="h-12 w-full" />
          ) : effective.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load cleanup policies</AlertTitle>
              <AlertDescription>
                {toUserMessage(effective.error, "Failed to load cleanup policies")}
                <Button variant="outline" size="sm" onClick={() => effective.refetch()}>Retry policies</Button>
              </AlertDescription>
            </Alert>
          ) : !effective.data?.length ? (
            <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No cleanup policies apply to this repository.
            </p>
          ) : (
            <ul className="space-y-2">
              {effective.data.map((policy) => (
                <li key={policy.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words text-sm font-medium">{policy.name}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{POLICY_TYPE_LABELS[policy.policy_type as PolicyType] ?? policy.policy_type}</Badge>
                      <Badge variant={policy.enabled ? "default" : "secondary"}>{policy.enabled ? "Enabled" : "Disabled"}</Badge>
                      <Badge variant="outline" className="whitespace-normal">{lifecycleScopeLabel(policy)}</Badge>
                    </div>
                    {policy.applies_to_all && (
                      <p className="text-xs text-muted-foreground">Inherited global policy. Individual repositories cannot detach.</p>
                    )}
                    {policy.scope_source === "legacy" && (
                      <p className="text-xs text-muted-foreground">Legacy scope (read-only). Upgrade the backend to manage assignments.</p>
                    )}
                    {policy.last_run_at && (
                      <p className="text-xs text-muted-foreground">
                        Last run: {new Date(policy.last_run_at).toLocaleDateString()}
                        {policy.last_run_items_removed != null && ` (${policy.last_run_items_removed} removed across the policy scope)`}
                      </p>
                    )}
                  </div>
                  {policy.scope_source === "explicit" && !policy.applies_to_all && policy.repository_ids.includes(repositoryId) && (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Detach policy ${policy.name}`}
                      disabled={!canChange}
                      onClick={() => setDetachTarget(policy)}
                    >Detach</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canAssign && (
            <div className="space-y-2">
              <Label htmlFor="cleanup-existing-policy">Attach an existing cleanup policy</Label>
              {available.isError ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load available policies</AlertTitle>
                  <AlertDescription>
                    {toUserMessage(available.error, "Failed to load available policies")}
                    <Button variant="outline" size="sm" onClick={() => available.refetch()}>Retry available policies</Button>
                  </AlertDescription>
                </Alert>
              ) : available.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">Loading available policies...</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={selectedPolicy?.id ?? ""}
                    onValueChange={setSelectedId}
                    disabled={!canChange || candidates.length === 0}
                  >
                    <SelectTrigger id="cleanup-existing-policy" className="w-full sm:w-80">
                      <SelectValue placeholder="Select a policy" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.name} ({lifecycleScopeLabel(policy)}{policy.enabled ? "" : "; disabled"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={!canChange || !selectedPolicy}
                    onClick={() => selectedPolicy && attach.mutate(selectedPolicy.id)}
                  >{attach.isPending ? "Attaching..." : "Attach policy"}</Button>
                </div>
              )}
              {!available.isError && !available.isPending && candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">No additional selected-scope or unassigned policies are available.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Attaching an enabled policy permits cleanup in this repository on future runs.
                Detaching preserves the policy and its assignments to other repositories.
              </p>
            </div>
          )}
          <ConfirmDialog
            open={!!detachTarget}
            onOpenChange={(open) => !open && setDetachTarget(null)}
            title="Detach Cleanup Policy"
            description={`Detach "${detachTarget?.name}" from this repository? The policy and its other assignments are preserved. Runs already in progress may still clean up this repository; detachment affects the next run.`}
            confirmText="Detach policy"
            loading={detach.isPending}
            onConfirm={() => {
              if (detachTarget) detach.mutate(detachTarget.id);
            }}
          />
        </>
      )}
    </section>
  );
}
