"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Filter, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  parsePatternLines,
  upstreamFilterApi,
  type UpstreamFilter,
} from "@/lib/api/upstream-filter";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface UpstreamFilterSettingsProps {
  repository: Repository;
}

interface PatternListFieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

function PatternListField({ id, label, hint, value, disabled, onChange }: PatternListFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        className="font-mono text-xs"
        rows={4}
        spellCheck={false}
        placeholder="One regular expression per line"
        aria-describedby={`${id}-hint`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

function asText(patterns: string[]): string {
  return patterns.join("\n");
}

/** Include and exclude patterns of a remote's upstream filter (#1034), repository admins only like the API */
export function UpstreamFilterSettings({ repository }: UpstreamFilterSettingsProps) {
  const queryClient = useQueryClient();
  const queryKey = ["repository", repository.key, "upstream-filter"];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => upstreamFilterApi.get(repository.key),
    retry: false,
  });

  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [synced, setSynced] = useState<UpstreamFilter | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const includePatterns = parsePatternLines(include);
  const excludePatterns = parsePatternLines(exclude);
  const dirty =
    synced !== null &&
    (asText(includePatterns) !== asText(synced.include_patterns) ||
      asText(excludePatterns) !== asText(synced.exclude_patterns));

  // Take the server copy when it changes, unless there are unsaved edits
  if (data && data !== synced && !dirty) {
    setSynced(data);
    setInclude(asText(data.include_patterns));
    setExclude(asText(data.exclude_patterns));
  }

  function applySaved(next: UpstreamFilter, message: string) {
    setSynced(next);
    setInclude(asText(next.include_patterns));
    setExclude(asText(next.exclude_patterns));
    queryClient.setQueryData(queryKey, next);
    toast.success(message);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      upstreamFilterApi.set(repository.key, {
        include_patterns: includePatterns,
        exclude_patterns: excludePatterns,
      }),
    onSuccess: (next) => applySaved(next, "Upstream filter saved"),
    onError: mutationErrorToast("Failed to save the upstream filter"),
  });

  const clearMutation = useMutation({
    mutationFn: () => upstreamFilterApi.remove(repository.key),
    onSuccess: (next) => {
      setConfirmClear(false);
      applySaved(next, "Upstream filter cleared");
    },
    onError: mutationErrorToast("Failed to clear the upstream filter"),
  });

  const busy = saveMutation.isPending || clearMutation.isPending;

  return (
    <section aria-labelledby="settings-upstream-filter-heading">
      <div className="flex items-center gap-2 mb-2">
        <Filter className="size-4 text-muted-foreground" />
        <h3 id="settings-upstream-filter-heading" className="text-base font-semibold">
          Upstream Filter
        </h3>
        {data &&
          (data.active ? (
            <Badge variant="secondary">Active</Badge>
          ) : (
            <Badge variant="outline">No filter</Badge>
          ))}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Which paths this repository fetches from its upstream. Patterns are regular expressions
        matched anywhere in the path sent upstream, anchor them with ^ and $. A refused path
        answers 404 without contacting the upstream.
      </p>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError || !data ? (
        <p className="text-sm text-muted-foreground">
          The upstream filter could not be loaded from this server.
        </p>
      ) : (
        <div className="space-y-4">
          {data.error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Every upstream fetch is refused</AlertTitle>
              <AlertDescription>
                The stored filter is unusable: {data.error}. Save a valid filter or clear it.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <PatternListField
              id="upstream-filter-include"
              label="Include patterns"
              hint="When set, only paths matching one of them are fetched"
              value={include}
              disabled={busy}
              onChange={setInclude}
            />
            <PatternListField
              id="upstream-filter-exclude"
              label="Exclude patterns"
              hint="Paths matching any of them are never fetched"
              value={exclude}
              disabled={busy}
              onChange={setExclude}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !dirty} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !data.active}
              onClick={() => setConfirmClear(true)}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the upstream filter?"
        description={`${repository.key} will fetch every path from its upstream again.`}
        confirmText="Clear"
        danger
        loading={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
      />
    </section>
  );
}
