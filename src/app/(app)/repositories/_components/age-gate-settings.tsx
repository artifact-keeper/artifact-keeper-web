"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ageGateApi from "@/lib/api/age-gate";
import { mutationErrorToast } from "@/lib/error-utils";
import type { Repository } from "@/types/repository";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface AgeGateSettingsProps {
  repository: Repository;
}

interface FormOverrides {
  enabled?: boolean;
  minAgeDays?: number;
}

export function AgeGateSettings({ repository }: AgeGateSettingsProps) {
  const queryClient = useQueryClient();
  const isEligible =
    repository.repo_type === "remote" &&
    (repository.format === "npm" || repository.format === "pypi");

  const { data, isLoading } = useQuery({
    queryKey: ["repository", repository.key, "age-gate"],
    queryFn: () => ageGateApi.getRepoConfig(repository.key),
    enabled: isEligible,
  });

  // Local overrides track user edits. Undefined = fall back to server value.
  const [overrides, setOverrides] = useState<FormOverrides>({});

  const enabled = overrides.enabled ?? data?.enabled ?? false;
  const minAgeDays = overrides.minAgeDays ?? data?.min_age_days ?? 7;

  const saveMutation = useMutation({
    mutationFn: () =>
      ageGateApi.updateRepoConfig(repository.key, {
        enabled,
        min_age_days: minAgeDays,
      }),
    onSuccess: () => {
      toast.success("Age gate settings saved");
      setOverrides({});
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key] });
      queryClient.invalidateQueries({ queryKey: ["repository", repository.key, "age-gate"] });
    },
    onError: mutationErrorToast("Failed to save age gate settings"),
  });

  if (!isEligible) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="text-base font-semibold">Age Gate</h3>
        <p className="text-sm text-muted-foreground">
          Block upstream package versions younger than the configured threshold. Clients receive
          the last known good version until a version is approved or crosses the age threshold.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="age-gate-enabled">Enable age gate</Label>
          <p className="text-xs text-muted-foreground">
            Applies to npm and PyPI proxy downloads for this repository.
          </p>
        </div>
        <Switch
          id="age-gate-enabled"
          checked={enabled}
          disabled={isLoading || saveMutation.isPending}
          onCheckedChange={(v) => setOverrides((o) => ({ ...o, enabled: v }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="age-gate-days">Minimum age (days)</Label>
        <Input
          id="age-gate-days"
          type="number"
          min={1}
          max={3650}
          value={minAgeDays}
          disabled={!enabled || isLoading || saveMutation.isPending}
          onChange={(e) => setOverrides((o) => ({ ...o, minAgeDays: Number(e.target.value) }))}
        />
      </div>

      <Button
        type="button"
        disabled={isLoading || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        Save age gate settings
      </Button>
    </div>
  );
}
