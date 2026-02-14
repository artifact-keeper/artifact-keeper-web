"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { XCircle } from "lucide-react";
import { toast } from "sonner";

import { promotionApi } from "@/lib/api/promotion";
import type { StagingArtifact } from "@/types/promotion";
import { formatBytes } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
      toast.success(
        `Successfully rejected ${count} artifact${count !== 1 ? "s" : ""}`
      );
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
    onError: (err: Error) => {
      toast.error(`Rejection failed: ${err.message}`);
    },
  });

  const handleReject = () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for rejection");
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
            Reject Artifacts
          </DialogTitle>
          <DialogDescription>
            Reject {selectedArtifacts.length} artifact
            {selectedArtifacts.length !== 1 ? "s" : ""} from staging. This
            action will mark them as rejected and prevent promotion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected Artifacts Summary */}
          <div className="space-y-2">
            <Label>Selected Artifacts</Label>
            <ScrollArea className="h-32 rounded-md border">
              <div className="p-2 space-y-1">
                {selectedArtifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="truncate font-medium">
                        {artifact.name}
                      </span>
                      {artifact.version && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal shrink-0"
                        >
                          {artifact.version}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatBytes(artifact.size_bytes)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Reason (required) */}
          <div className="space-y-2">
            <Label htmlFor="reject-reason">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              placeholder="Provide a reason for rejecting these artifacts..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Notes (optional) */}
          <div className="space-y-2">
            <Label htmlFor="reject-notes">Notes (optional)</Label>
            <Textarea
              id="reject-notes"
              placeholder="Add any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={rejectMutation.isPending || !reason.trim()}
          >
            {rejectMutation.isPending ? "Rejecting..." : "Reject Artifact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
