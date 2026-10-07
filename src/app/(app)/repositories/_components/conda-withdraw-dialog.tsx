"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { toast } from "sonner";

import { condaApi } from "@/lib/api/conda";
import { condaFilename } from "@/lib/conda";
import { mutationErrorToast } from "@/lib/error-utils";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Withdraw from channel" for one conda package (#913): a required reason,
 * then a confirmation step that says what withdrawal does, then
 * `DELETE /conda/{key}/{subdir}/{file}`. Admin-only and hosted-only; the
 * caller decides whether to render it.
 */
export function CondaWithdrawButton({
  repoKey,
  path,
  onWithdrawn,
}: {
  repoKey: string;
  path: string;
  onWithdrawn?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const filename = condaFilename(path);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setReason("");
      setConfirming(false);
    }
  };

  const mutation = useMutation({
    mutationFn: () => condaApi.withdraw(repoKey, path, reason.trim()),
    onSuccess: () => {
      toast.success(`Withdrew ${filename} from ${repoKey}`);
      queryClient.invalidateQueries({ queryKey: ["artifacts", repoKey] });
      queryClient.invalidateQueries({ queryKey: ["conda-notices", repoKey] });
      queryClient.invalidateQueries({ queryKey: ["quarantine"] });
      close(false);
      onWithdrawn?.();
    },
    onError: mutationErrorToast("Withdrawal failed"),
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ban className="size-4 text-destructive" />
        Withdraw
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw from channel</DialogTitle>
            <DialogDescription>
              <code className="break-all">{filename}</code> in {repoKey}
            </DialogDescription>
          </DialogHeader>
          {!confirming ? (
            <div className="space-y-2">
              <Label htmlFor="withdraw-reason">Reason (published in the channel notice)</Label>
              <Textarea
                id="withdraw-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. CVE-2026-1234: remote code execution in the report renderer"
                rows={3}
              />
            </div>
          ) : (
            <div className="space-y-2 text-sm" data-testid="withdraw-confirm">
              <p>
                The package will be removed from every repodata variant and
                listed in the channel&apos;s <code>removed</code> array, downloads
                will be refused, and this notice is published to clients
                polling <code>notices.json</code>:
              </p>
              <blockquote className="rounded-md border bg-muted/40 p-2 text-xs">
                Package {filename} was withdrawn from this channel: {reason.trim()}
              </blockquote>
              <p className="text-xs text-muted-foreground">
                The artifact record is kept under a permanent hold for audit; an
                administrator can release it from the quarantine queue.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => (confirming ? setConfirming(false) : close(false))}>
              {confirming ? "Back" : "Cancel"}
            </Button>
            {!confirming ? (
              <Button disabled={reason.trim() === ""} onClick={() => setConfirming(true)}>
                Continue
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Withdrawing..." : "Withdraw package"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
