"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  /** If set, user must type this string to enable the confirm button */
  typeToConfirm?: string;
  /** Use destructive styling on confirm button */
  danger?: boolean;
  /** Show a loading spinner on confirm */
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  typeToConfirm,
  danger = false,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  const canConfirm = typeToConfirm ? typed === typeToConfirm : true;

  const handleOpenChange = (next: boolean) => {
    if (!next) setTyped("");
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {typeToConfirm && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Type <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">{typeToConfirm}</code> to confirm
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={typeToConfirm}
              autoFocus
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          <Button
            variant={danger ? "destructive" : "default"}
            disabled={!canConfirm || loading}
            onClick={onConfirm}
          >
            {loading ? "Processing..." : confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
