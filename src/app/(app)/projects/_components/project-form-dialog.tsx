"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_KEY_PATTERN, type Project } from "@/lib/api/projects";
import {
  bytesToQuotaInput,
  quotaInputToBytes,
  type QuotaUnit,
} from "@/lib/project-utils";

export interface ProjectFormValues {
  key: string;
  name: string;
  description: string;
  quota_bytes?: number;
}

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this project (the key is immutable). */
  project?: Project;
  /** Quota is global-admin only on the backend; hide it for everyone else. */
  canEditQuota: boolean;
  pending?: boolean;
  onSubmit: (values: ProjectFormValues) => void;
}

export function ProjectFormDialog(props: ProjectFormDialogProps) {
  // Remount on open so the form always starts from the current project.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProjectFormBody {...props} />}
    </Dialog>
  );
}

function ProjectFormBody({
  onOpenChange,
  project,
  canEditQuota,
  pending,
  onSubmit,
}: ProjectFormDialogProps) {
  const initialQuota = bytesToQuotaInput(project?.quota_bytes);
  const [key, setKey] = useState(project?.key ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [quotaValue, setQuotaValue] = useState(initialQuota.value);
  const [quotaUnit, setQuotaUnit] = useState<QuotaUnit>(initialQuota.unit);

  const editing = !!project;
  const keyValid = editing || PROJECT_KEY_PATTERN.test(key);
  const canSubmit = keyValid && name.trim().length > 0 && !pending;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit project" : "Create project"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Update the project's name, description or storage quota."
            : "A project groups repositories and the people who can access them."}
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onSubmit({
            key,
            name: name.trim(),
            description: description.trim(),
            quota_bytes: canEditQuota ? quotaInputToBytes(quotaValue, quotaUnit) : undefined,
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="project-key">Key</Label>
          <Input
            id="project-key"
            value={key}
            disabled={editing}
            placeholder="payments"
            aria-invalid={!keyValid && key.length > 0}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
          />
          <p className="text-xs text-muted-foreground">
            Lowercase letters, digits and dashes. Name the project&apos;s repositories
            <code className="mx-1">{key || "key"}-...</code>: no other project may use that prefix.
            The key cannot be changed later.
          </p>
          {!keyValid && key.length > 0 && (
            <p className="text-xs text-destructive" role="alert">
              Use lowercase letters, digits and dashes, starting with a letter or digit.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            placeholder="Payments"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-description">Description</Label>
          <Textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {canEditQuota && (
          <div className="space-y-2">
            <Label htmlFor="project-quota">Storage quota</Label>
            <div className="flex gap-2">
              <Input
                id="project-quota"
                type="number"
                min="0"
                step="any"
                value={quotaValue}
                placeholder="Unlimited"
                onChange={(e) => setQuotaValue(e.target.value)}
              />
              <Select value={quotaUnit} onValueChange={(v) => setQuotaUnit(v as QuotaUnit)}>
                <SelectTrigger className="w-24" aria-label="Quota unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MB">MB</SelectItem>
                  <SelectItem value="GB">GB</SelectItem>
                  <SelectItem value="TB">TB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Total across every repository in the project. Leave empty for unlimited.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
