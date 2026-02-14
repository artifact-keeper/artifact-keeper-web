"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, AlertTriangle, XCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

import { promotionApi } from "@/lib/api/promotion";
import type { StagingArtifact, BulkPromoteRequest, PolicyViolation } from "@/types/promotion";
import type { Repository } from "@/types";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SEVERITY_COLORS } from "@/types/promotion";

import { ArtifactListPreview } from "./artifact-list-preview";

interface PromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceRepoKey: string;
  sourceRepoFormat: string;
  selectedArtifacts: StagingArtifact[];
  onSuccess?: () => void;
}

export function PromotionDialog({
  open,
  onOpenChange,
  sourceRepoKey,
  sourceRepoFormat,
  selectedArtifacts,
  onSuccess,
}: PromotionDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;

  const [targetRepo, setTargetRepo] = useState("");
  const [notes, setNotes] = useState("");
  const [skipPolicyCheck, setSkipPolicyCheck] = useState(false);

  // Fetch release repositories matching the source format
  const { data: releaseRepos, isLoading: reposLoading } = useQuery({
    queryKey: ["release-repos", sourceRepoFormat],
    queryFn: () => promotionApi.listReleaseRepos({ format: sourceRepoFormat }),
    enabled: open,
  });

  // Collect all policy violations from selected artifacts
  const allViolations = useMemo(() => {
    const violations: Array<{ artifact: StagingArtifact; violation: PolicyViolation }> = [];
    for (const artifact of selectedArtifacts) {
      if (artifact.policy_result?.violations) {
        for (const v of artifact.policy_result.violations) {
          violations.push({ artifact, violation: v });
        }
      }
    }
    return violations;
  }, [selectedArtifacts]);

  const hasBlockingViolations = allViolations.some(
    (v) => v.violation.severity === "critical" || v.violation.severity === "high"
  );

  const promoteMutation = useMutation({
    mutationFn: (req: BulkPromoteRequest) => promotionApi.promoteBulk(sourceRepoKey, req),
    onSuccess: (result) => {
      if (result.promoted === result.total) {
        toast.success(`Successfully promoted ${result.promoted} artifact(s)`);
      } else {
        toast.warning(
          `Promoted ${result.promoted} of ${result.total} artifacts. ${result.failed} failed.`
        );
      }
      queryClient.invalidateQueries({ queryKey: ["staging-artifacts", sourceRepoKey] });
      queryClient.invalidateQueries({ queryKey: ["promotion-history", sourceRepoKey] });
      onOpenChange(false);
      setTargetRepo("");
      setNotes("");
      setSkipPolicyCheck(false);
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast.error(`Promotion failed: ${err.message}`);
    },
  });

  const handlePromote = () => {
    if (!targetRepo) {
      toast.error("Please select a target repository");
      return;
    }
    promoteMutation.mutate({
      target_repository: targetRepo,
      artifact_ids: selectedArtifacts.map((a) => a.id),
      skip_policy_check: skipPolicyCheck,
      notes: notes || undefined,
    });
  };

  const targetRepoList = releaseRepos?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Promote Artifacts
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground font-normal">Release</span>
          </DialogTitle>
          <DialogDescription>
            Promote {selectedArtifacts.length} artifact
            {selectedArtifacts.length !== 1 ? "s" : ""} from staging to a release repository.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target Repository */}
          <div className="space-y-2">
            <Label>Target Repository</Label>
            <Select value={targetRepo} onValueChange={setTargetRepo} disabled={reposLoading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={reposLoading ? "Loading..." : "Select target repository"} />
              </SelectTrigger>
              <SelectContent>
                {targetRepoList.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No release repositories found for {sourceRepoFormat}
                  </div>
                ) : (
                  targetRepoList.map((repo: Repository) => (
                    <SelectItem key={repo.id} value={repo.key}>
                      {repo.key} ({repo.name})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Artifacts Summary */}
          <ArtifactListPreview
            artifacts={selectedArtifacts}
            renderTrailing={(artifact) => {
              const icons: Record<string, React.ReactNode> = {
                passing: <CheckCircle className="size-3.5 text-green-500" />,
                failing: <XCircle className="size-3.5 text-red-500" />,
                warning: <AlertTriangle className="size-3.5 text-yellow-500" />,
              };
              return artifact.policy_status ? icons[artifact.policy_status] : null;
            }}
          />

          {/* Policy Violations Warning */}
          {allViolations.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="size-4" />
                Policy Violations ({allViolations.length})
              </Label>
              <ScrollArea className="h-24 rounded-md border border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-950/20">
                <div className="p-2 space-y-1">
                  {allViolations.slice(0, 10).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <Badge
                        className={`shrink-0 text-[10px] ${SEVERITY_COLORS[item.violation.severity]}`}
                      >
                        {item.violation.severity}
                      </Badge>
                      <span className="text-muted-foreground">
                        {item.artifact.name}: {item.violation.message}
                      </span>
                    </div>
                  ))}
                  {allViolations.length > 10 && (
                    <p className="text-xs text-muted-foreground italic">
                      ...and {allViolations.length - 10} more
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="promo-notes">Notes (optional)</Label>
            <Textarea
              id="promo-notes"
              placeholder="Add notes about this promotion..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Skip Policy Check (Admin only) */}
          {isAdmin && hasBlockingViolations && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900">
              <Checkbox
                id="skip-policy"
                checked={skipPolicyCheck}
                onCheckedChange={(checked) => setSkipPolicyCheck(checked === true)}
              />
              <div className="space-y-0.5">
                <Label
                  htmlFor="skip-policy"
                  className="text-sm font-medium cursor-pointer"
                >
                  Skip policy check (Admin override)
                </Label>
                <p className="text-xs text-muted-foreground">
                  This will promote artifacts with policy violations.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePromote}
            disabled={
              promoteMutation.isPending ||
              !targetRepo ||
              (hasBlockingViolations && !skipPolicyCheck)
            }
          >
            {promoteMutation.isPending ? "Promoting..." : "Promote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
