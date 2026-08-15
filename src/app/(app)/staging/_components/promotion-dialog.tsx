"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowRight, AlertTriangle, XCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

import { promotionApi } from "@/lib/api/promotion";
import { repositoriesApi } from "@/lib/api/repositories";
import { mutationErrorToast } from "@/lib/error-utils";
import type { StagingArtifact, BulkPromoteRequest, PolicyViolation } from "@/types/promotion";
import type { Repository } from "@/types";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  const t = useTranslations("promotion");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;

  const [targetRepo, setTargetRepo] = useState("");
  const [notes, setNotes] = useState("");
  const [skipPolicyCheck, setSkipPolicyCheck] = useState(false);

  // If this staging repo has a linked release target, the backend requires
  // promotions to go there, so lock the picker to it rather than making the
  // operator re-pick (and risk a rejection) every time. Free picker otherwise.
  const { data: releaseTarget, isLoading: targetLoading } = useQuery({
    queryKey: ["repository", sourceRepoKey, "release-target"],
    queryFn: () => repositoriesApi.getReleaseTarget(sourceRepoKey),
    enabled: open,
  });
  const lockedKey =
    releaseTarget?.linked && releaseTarget.release_repository_key
      ? releaseTarget.release_repository_key
      : null;

  // Fetch release repositories matching the source format. Skipped when a
  // linked target locks the picker — the list is never shown in that case.
  const { data: releaseRepos, isLoading: reposLoading } = useQuery({
    queryKey: ["release-repos", sourceRepoFormat],
    queryFn: () => promotionApi.listReleaseRepos({ format: sourceRepoFormat }),
    enabled: open && !lockedKey,
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
        toast.success(t("promoted", { count: result.promoted }));
      } else {
        toast.warning(
          t("promotedPartial", {
            promoted: result.promoted,
            total: result.total,
            failed: result.failed,
          })
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
    onError: mutationErrorToast(t("promoteFailed")),
  });

  const handlePromote = () => {
    const target = lockedKey ?? targetRepo;
    if (!target) {
      toast.error(t("targetRequired"));
      return;
    }
    promoteMutation.mutate({
      target_repository: target,
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
            {t("title")}
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground font-normal">{t("release")}</span>
          </DialogTitle>
          <DialogDescription>
            {t("description", { count: selectedArtifacts.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target Repository */}
          <div className="space-y-2">
            <Label>{t("targetRepo")}</Label>
            {targetLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : lockedKey ? (
              <>
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{lockedKey}</span>
                  <Badge variant="secondary" className="text-xs">
                    {t("linkedTarget")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("linkedTargetDetail")}
                </p>
              </>
            ) : (
              <Select value={targetRepo} onValueChange={setTargetRepo} disabled={reposLoading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={reposLoading ? t("loading") : t("selectTarget")} />
                </SelectTrigger>
                <SelectContent>
                  {targetRepoList.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      {t("noReleaseRepos", { format: sourceRepoFormat })}
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
            )}
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
                {t("policyViolations", { count: allViolations.length })}
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
                      {t("andMore", { count: allViolations.length - 10 })}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="promo-notes">{t("notes")}</Label>
            <Textarea
              id="promo-notes"
              placeholder={t("notesPlaceholder")}
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
                  {t("skipPolicy")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("skipPolicyDetail")}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handlePromote}
            disabled={
              promoteMutation.isPending ||
              !(lockedKey ?? targetRepo) ||
              (hasBlockingViolations && !skipPolicyCheck)
            }
          >
            {promoteMutation.isPending ? t("promoting") : t("promote")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
