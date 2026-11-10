"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import type { DataTableColumn } from "@/components/common/data-table";
import { mutationErrorToast } from "@/lib/error-utils";
import {
  securityReviewersApi,
  type ReviewerKind,
} from "@/lib/api/security-reviewers";

const KEY = ["security-reviewers"];

/** Undefined while loading, null when the backend has no reviewer API */
export function useSecurityReviewers(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    queryFn: securityReviewersApi.list,
    enabled,
  });
}

function SecurityReviewerSwitch({
  kind,
  id,
  name,
  checked,
}: {
  kind: ReviewerKind;
  id: string;
  name: string;
  checked: boolean;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (on: boolean) => securityReviewersApi.set(kind, id, on),
    onSuccess: (_r, on) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success(
        `${name} ${on ? "can now" : "can no longer"} review package exceptions`,
      );
    },
    onError: mutationErrorToast("Failed to update security reviewer"),
  });
  return (
    <Switch
      checked={checked}
      disabled={toggle.isPending}
      onCheckedChange={(on: boolean) => toggle.mutate(on)}
      aria-label={`Security reviewer: ${name}`}
    />
  );
}

/** The "Security reviewer" column for an admin table, none until the backend answers with the API */
export function useSecurityReviewerColumn<T extends { id: string }>(
  kind: ReviewerKind,
  isAdmin: boolean,
  nameOf: (row: T) => string,
): DataTableColumn<T>[] {
  const { data } = useSecurityReviewers(isAdmin);
  if (!data) return [];
  const granted: Array<{ id: string }> = data[kind];
  const ids = new Set(granted.map((r) => r.id));
  return [
    {
      id: "security_reviewer",
      header: "Security reviewer",
      cell: (row) => (
        <SecurityReviewerSwitch
          kind={kind}
          id={row.id}
          name={nameOf(row)}
          checked={ids.has(row.id)}
        />
      ),
    },
  ];
}
