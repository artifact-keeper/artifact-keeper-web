"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** Destructive styling on Confirm (block actions). */
  destructive?: boolean;
  pending?: boolean;
  /** Bulk actions require a reason for the audit log; single ones may not. */
  requireReason?: boolean;
  placeholder?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  /** Extra controls between the reason field and the footer. */
  children?: ReactNode;
}

/**
 * The curation page's reason prompt, shared by the package queue and the
 * MCP queue. The reason lives in the body component, which the dialog
 * unmounts on close, so a cancelled reason never comes back on reopen.
 */
export function ReasonDialog({ open, onCancel, ...rest }: ReasonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <ReasonDialogBody onCancel={onCancel} {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialogBody({
  title,
  description,
  destructive,
  pending,
  requireReason = true,
  placeholder = "Reason (e.g. CVE-free, license OK)",
  onCancel,
  onConfirm,
  children,
}: Omit<ReasonDialogProps, "open">) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <Input
          placeholder={placeholder}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason"
        />
        {children}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          disabled={(requireReason && trimmed === "") || pending}
          onClick={() => onConfirm(trimmed)}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Confirm
        </Button>
      </DialogFooter>
    </>
  );
}
