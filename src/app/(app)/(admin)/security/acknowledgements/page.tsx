"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Undo2 } from "lucide-react";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { useRepositories } from "@/hooks/use-repositories";
import { acknowledgementsApi } from "@/lib/api/acknowledgements";
import { describeRevokeById, reportRevokeOutcome } from "@/lib/acknowledgements";
import { isForbiddenError, mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import type { AcknowledgementDecision } from "@/types/security";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";

const CREATED_VIA_LABELS: Record<string, string> = {
  api: "Direct",
  promotion: "Carried by promotion",
  migration: "Upgrade to 1.12",
};

function StateBadge({ decision }: { decision: AcknowledgementDecision }) {
  if (decision.state === "active") {
    return (
      <Badge
        variant="outline"
        className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800 text-xs"
      >
        Active
      </Badge>
    );
  }
  const label =
    decision.state === "revoked" && decision.revoked_reason === "superseded"
      ? "Superseded"
      : decision.state;
  return (
    <Badge variant="outline" className="text-xs capitalize">
      {label}
    </Badge>
  );
}

/**
 * Acknowledgement decisions, which can outlive any finding row that reaches them
 * (artifact-keeper#5224), so they need their own place to be seen and undone.
 */
export default function AcknowledgementsPage() {
  useDocumentTitle("Acknowledgements");
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [advisoryInput, setAdvisoryInput] = useState("");
  const [advisory, setAdvisory] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const { data: repositories } = useRepositories({ per_page: 1000 });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "security",
      "acknowledgements",
      "list",
      includeInactive,
      advisory || undefined,
      page,
      pageSize,
    ],
    queryFn: () =>
      acknowledgementsApi.list({
        include_inactive: includeInactive || undefined,
        advisory: advisory || undefined,
        page,
        per_page: pageSize,
      }),
    retry: false,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => acknowledgementsApi.revoke(id),
    onSuccess: (outcome) => {
      queryClient.invalidateQueries({ queryKey: ["security"] });
      setRevokeId(null);
      reportRevokeOutcome(describeRevokeById(outcome));
    },
    onError: mutationErrorToast("Failed to revoke the decision"),
  });

  function repositoryLabel(id: string | null): string {
    if (id === null) return "Every repository";
    return repositories?.items?.find((r) => r.id === id)?.key ?? id.slice(0, 8);
  }

  const columns: DataTableColumn<AcknowledgementDecision>[] = [
    {
      id: "advisory",
      header: "Advisory",
      cell: (d) => <span className="text-sm font-medium">{d.advisory}</span>,
    },
    {
      id: "component",
      header: "Component",
      cell: (d) =>
        d.component ? (
          <span className="text-sm">
            {d.component}
            {d.component_version && (
              <span className="text-muted-foreground"> @ {d.component_version}</span>
            )}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        ),
    },
    {
      id: "repository",
      header: "Applies in",
      cell: (d) => <span className="text-sm">{repositoryLabel(d.repository_id)}</span>,
    },
    {
      id: "bytes",
      header: "Bytes",
      cell: (d) => (
        <code className="text-xs" title={d.checksum_sha256}>
          {d.checksum_sha256.slice(0, 12)}
        </code>
      ),
    },
    {
      id: "max_severity",
      header: "Accepted up to",
      cell: (d) => (
        <Badge variant="outline" className="text-xs uppercase">
          {d.max_severity}
        </Badge>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: (d) => (
        <p className="max-w-xs truncate text-sm" title={d.reason ?? undefined}>
          {d.reason ?? "-"}
        </p>
      ),
    },
    {
      id: "made",
      header: "Made",
      cell: (d) => (
        <div>
          <p className="text-xs text-muted-foreground">
            {new Date(d.acknowledged_at).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            {CREATED_VIA_LABELS[d.created_via] ?? d.created_via}
          </p>
        </div>
      ),
    },
    {
      id: "expires_at",
      header: "Expires",
      cell: (d) => (
        <span className="text-xs text-muted-foreground">
          {d.expires_at ? new Date(d.expires_at).toLocaleString() : "Until revoked"}
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      cell: (d) => <StateBadge decision={d} />,
    },
    {
      id: "actions",
      header: "",
      cell: (d) =>
        d.state === "revoked" ? null : (
          <Button variant="ghost" size="sm" onClick={() => setRevokeId(d.id)}>
            <Undo2 className="size-3.5 mr-1" />
            Revoke
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Acknowledgements"
        description="Decisions to accept the risk of a finding, for specific bytes, in a repository or in all of them."
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="acknowledgements-inactive"
            aria-label="Include expired and revoked"
            checked={includeInactive}
            onCheckedChange={(checked) => {
              setIncludeInactive(checked);
              setPage(1);
            }}
          />
          <Label htmlFor="acknowledgements-inactive">Include expired and revoked</Label>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAdvisory(advisoryInput.trim());
            setPage(1);
          }}
        >
          <Input
            aria-label="Advisory"
            placeholder="CVE id or finding title"
            className="h-9 w-[240px]"
            value={advisoryInput}
            onChange={(e) => setAdvisoryInput(e.target.value)}
          />
          <Button type="submit" variant="outline" size="sm">
            Apply
          </Button>
        </form>
      </div>

      {isError && (
        <Alert variant="destructive" data-testid="acknowledgements-error">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load decisions</AlertTitle>
          <AlertDescription>
            {isForbiddenError(error)
              ? "This list covers every repository, so it needs an administrator with an unrestricted credential and an instance-wide role. Repository roles alone are not enough, and creating a repository grants those. A decision can still be revoked from its finding."
              : toUserMessage(error, "The decisions could not be loaded.")}
          </AlertDescription>
        </Alert>
      )}

      {!isError && (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          total={data?.total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          loading={isLoading}
          emptyMessage={
            includeInactive ? "No decisions have been recorded." : "No decision is in force."
          }
          rowKey={(d) => d.id}
        />
      )}

      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(o) => {
          if (!o) setRevokeId(null);
        }}
        title="Revoke Decision"
        description="The finding opens again where this decision applied, and the scan policy can refuse the artifact. Copies a promotion made of it are revoked too, where you have authority over them. Are you sure?"
        confirmText="Revoke"
        danger
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeId) revokeMutation.mutate(revokeId);
        }}
      />
    </div>
  );
}
