"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Route, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { repositoriesApi, type RoutingRule } from "@/lib/api/repositories";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RoutingRulesSettingsProps {
  repository: Repository;
}

/**
 * Routing rules management for a repository (issue #263).
 *
 * Routing rules rewrite the request path before it is forwarded to an upstream
 * server. Each rule is a regex `path_pattern` and a `rewrite_to` template that
 * may reference capture groups (`$1`, `$2`, ...). Rules are evaluated in order
 * and the first match wins.
 *
 * The backend stores the full ordered list, so add/edit/remove all save the
 * complete set via a single POST. Deleting the last rule clears all rules.
 */
export function RoutingRulesSettings({ repository }: RoutingRulesSettingsProps) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["repository", repository.key, "routing-rules"],
    [repository.key]
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => repositoriesApi.getRoutingRules(repository.key),
  });

  // Local editable copy of the rule list. Synced from the server response using
  // the "adjust state during render" pattern (React docs) rather than an effect,
  // so the table reflects fresh query data without an extra commit cycle.
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [syncedRef, setSyncedRef] = useState<RoutingRule[] | null>(null);
  // Draft for the "add rule" row.
  const [draft, setDraft] = useState<RoutingRule>({
    path_pattern: "",
    rewrite_to: "",
  });
  // Validation message for the add-rule row, associated with the pattern input
  // via aria-describedby so it is announced rather than only shown in a toast.
  const [addError, setAddError] = useState<string | null>(null);

  // Whether the locally edited rules differ from the server copy. Computed
  // before the resync below so the resync can avoid clobbering unsaved edits.
  const serverRules = data?.rules ?? [];
  // `dirty` is only meaningful after the first sync. Before the initial seed
  // (syncedRef === null), local `rules` is still [] while the server may already
  // have rules, so a raw length/content comparison would report dirty and the
  // `!dirty` guard below would block the seed, leaving the table empty. Gating
  // on syncedRef !== null lets the initial seed run, then resumes protecting
  // unsaved edits once a sync has happened.
  const dirty =
    syncedRef !== null &&
    (serverRules.length !== rules.length ||
      rules.some(
        (rule, i) =>
          rule.path_pattern !== serverRules[i]?.path_pattern ||
          rule.rewrite_to !== serverRules[i]?.rewrite_to
      ));

  // Resync only when there are no unsaved edits. React Query hands back a fresh
  // array reference on every refetch (e.g. window focus) even when the content
  // is unchanged, so a by-reference check alone would discard in-progress edits.
  // (review fix #462)
  if (data?.rules && data.rules !== syncedRef && !dirty) {
    setSyncedRef(data.rules);
    setRules(data.rules);
  }

  const saveMutation = useMutation({
    mutationFn: (next: RoutingRule[]) =>
      repositoriesApi.setRoutingRules(repository.key, next),
    onSuccess: (resp) => {
      setRules(resp.rules);
      queryClient.invalidateQueries({ queryKey });
      toast.success("Routing rules saved");
    },
    onError: mutationErrorToast("Failed to save routing rules"),
  });

  const clearMutation = useMutation({
    mutationFn: () => repositoriesApi.deleteRoutingRules(repository.key),
    onSuccess: () => {
      setRules([]);
      queryClient.invalidateQueries({ queryKey });
      toast.success("Routing rules cleared");
    },
    onError: mutationErrorToast("Failed to clear routing rules"),
  });

  const isBusy = saveMutation.isPending || clearMutation.isPending;

  const handleAdd = () => {
    const pattern = draft.path_pattern.trim();
    const rewrite = draft.rewrite_to.trim();
    if (!pattern || !rewrite) {
      setAddError("Both pattern and rewrite target are required.");
      return;
    }
    // The pattern is a regex evaluated by the backend; reject an invalid one
    // here so the operator gets immediate, associated feedback instead of a
    // 400 at save time.
    try {
      new RegExp(pattern);
    } catch {
      setAddError("Path pattern is not a valid regular expression.");
      return;
    }
    setAddError(null);
    const next = [...rules, { path_pattern: pattern, rewrite_to: rewrite }];
    saveMutation.mutate(next, {
      onSuccess: (resp) => {
        setRules(resp.rules);
        setDraft({ path_pattern: "", rewrite_to: "" });
        queryClient.invalidateQueries({ queryKey });
        toast.success("Routing rule added");
      },
    });
  };

  const handleRemove = (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    if (next.length === 0) {
      // No rules left: clear the config entry entirely.
      clearMutation.mutate();
      return;
    }
    saveMutation.mutate(next, {
      onSuccess: (resp) => {
        setRules(resp.rules);
        queryClient.invalidateQueries({ queryKey });
        toast.success("Routing rule removed");
      },
    });
  };

  const handleEditField = (
    index: number,
    field: keyof RoutingRule,
    value: string
  ) => {
    setRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule))
    );
  };

  return (
    <section aria-labelledby="settings-routing-rules-heading">
      <div className="flex items-center gap-2 mb-2">
        <Route className="size-4 text-muted-foreground" />
        <h3
          id="settings-routing-rules-heading"
          className="text-base font-semibold"
        >
          Routing Rules
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Rewrite request paths before they are forwarded upstream. Each rule is a
        regex pattern and a rewrite template. Reference capture groups with{" "}
        <code className="font-mono">$1</code>,{" "}
        <code className="font-mono">$2</code>, and so on. Rules are evaluated in
        order; the first match wins.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {rules.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No routing rules configured. Requests are forwarded upstream
                unchanged.
              </p>
            </div>
          ) : (
            <Table aria-label="Routing rules">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Path pattern</TableHead>
                  <TableHead>Rewrite to</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Rule ${index + 1} path pattern`}
                        value={rule.path_pattern}
                        onChange={(e) =>
                          handleEditField(index, "path_pattern", e.target.value)
                        }
                        className="font-mono text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Rule ${index + 1} rewrite to`}
                        value={rule.rewrite_to}
                        onChange={(e) =>
                          handleEditField(index, "rewrite_to", e.target.value)
                        }
                        className="font-mono text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemove(index)}
                        disabled={isBusy}
                        aria-label={`Remove rule ${index + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Save edits to existing rules */}
          {dirty && rules.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => saveMutation.mutate(rules)}
                disabled={isBusy}
                size="sm"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRules(data?.rules ?? [])}
                disabled={isBusy}
              >
                Discard
              </Button>
            </div>
          )}

          {/* Add a new rule */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-medium">Add a rule</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="routing-rule-pattern" className="text-xs">
                  Path pattern
                </Label>
                <Input
                  id="routing-rule-pattern"
                  value={draft.path_pattern}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, path_pattern: e.target.value }));
                    if (addError) setAddError(null);
                  }}
                  placeholder="releases/(.+)"
                  className="font-mono text-xs"
                  aria-invalid={addError != null}
                  aria-describedby="routing-rule-error"
                />
              </div>
              <div className="hidden items-end pb-2 text-muted-foreground sm:flex">
                <ArrowRight className="size-4" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="routing-rule-rewrite" className="text-xs">
                  Rewrite to
                </Label>
                <Input
                  id="routing-rule-rewrite"
                  value={draft.rewrite_to}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, rewrite_to: e.target.value }))
                  }
                  placeholder="download/$1"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            {/* Persistent live region so the error is announced when it
                appears and stays associated with the pattern input. */}
            <p
              id="routing-rule-error"
              role="alert"
              className="min-h-[1rem] text-sm text-red-500"
            >
              {addError}
            </p>
            <Button
              onClick={handleAdd}
              disabled={isBusy || !draft.path_pattern.trim() || !draft.rewrite_to.trim()}
              size="sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add rule
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
