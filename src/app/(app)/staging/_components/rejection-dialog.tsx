"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { XCircle } from "lucide-react";
import { toast } from "sonner";

import { promotionApi } from "@/lib/api/promotion";
import { mutationErrorToast } from "@/lib/error-utils";
import type { StagingArtifact } from "@/types/promotion";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { ArtifactListPreview } from "./artifact-list-preview";

interface RejectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceRepoKey: string;
  selectedArtifacts: StagingArtifact[];
  onSuccess?: () => void;
}

export function RejectionDialog({
  open,
  onOpenChange,
  sourceRepoKey,
  selectedArtifacts,
  onSuccess,
}: RejectionDialogProps) {
  const t = useTranslations("rejection");
  const queryClient = useQueryClient();

  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const rejectMutation = useMutation({
    mutationFn: async () => {
      // Reject each selected artifact sequentially
      const results = [];
      for (const artifact of selectedArtifacts) {
        const result = await promotionApi.rejectArtifact(
          sourceRepoKey,
          artifact.id,
          { reason, notes: notes || undefined }
        );
        results.push(result);
      }
      return results;
    },
    onSuccess: (results) => {
      const count = results.length;
      toast.success(t("rejected", { count }));
      queryClient.invalidateQueries({
        queryKey: ["staging-artifacts", sourceRepoKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["promotion-history", sourceRepoKey],
      });
      onOpenChange(false);
      setReason("");
      setNotes("");
      onSuccess?.();
    },
    onError: mutationErrorToast(t("rejectFailed")),
  });

  const handleReject = () => {
    if (!reason.trim()) {
      toast.error(t("reasonRequired"));
      return;
    }
    rejectMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-red-500" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { count: selectedArtifacts.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ArtifactListPreview artifacts={selectedArtifacts} />

          {/* Reason (required) */}
          <div className="space-y-2">
            <Label htmlFor="reject-reason">
              {t("reason")} <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              placeholder={t("reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="reject-notes">{t("notes")}</Label>
            <Textarea
              id="reject-notes"
              placeholder={t("notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={rejectMutation.isPending || !reason.trim()}
          >
            {rejectMutation.isPending ? t("rejecting") : t("reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
