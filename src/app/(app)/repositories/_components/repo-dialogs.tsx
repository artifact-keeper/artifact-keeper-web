"use client";

import { useState, useEffect } from "react";
import type { Repository, CreateRepositoryRequest, RepositoryFormat, RepositoryType } from "@/types";
import { FORMAT_OPTIONS, TYPE_OPTIONS } from "../_lib/constants";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

// Build format groups for grouped select
const FORMAT_GROUPS = Array.from(
  FORMAT_OPTIONS.reduce((map, o) => {
    if (!map.has(o.group)) map.set(o.group, []);
    map.get(o.group)!.push(o);
    return map;
  }, new Map<string, typeof FORMAT_OPTIONS>())
);

interface RepoDialogsProps {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onCreateSubmit: (data: CreateRepositoryRequest) => void;
  createPending: boolean;
  editOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  editRepo: Repository | null;
  onEditSubmit: (key: string, data: { name: string; description: string; is_public: boolean }) => void;
  editPending: boolean;
  deleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  deleteRepo: Repository | null;
  onDeleteConfirm: (key: string) => void;
  deletePending: boolean;
}

export function RepoDialogs({
  createOpen,
  onCreateOpenChange,
  onCreateSubmit,
  createPending,
  editOpen,
  onEditOpenChange,
  editRepo,
  onEditSubmit,
  editPending,
  deleteOpen,
  onDeleteOpenChange,
  deleteRepo,
  onDeleteConfirm,
  deletePending,
}: RepoDialogsProps) {
  // Create form state
  const [createForm, setCreateForm] = useState<CreateRepositoryRequest>({
    key: "",
    name: "",
    description: "",
    format: "generic",
    repo_type: "local",
    is_public: true,
  });

  // Edit form state
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    is_public: boolean;
  }>({ name: "", description: "", is_public: true });

  // Sync edit form when editRepo changes
  useEffect(() => {
    if (editRepo) {
      setEditForm({
        name: editRepo.name,
        description: editRepo.description ?? "",
        is_public: editRepo.is_public,
      });
    }
  }, [editRepo]);

  const resetCreateForm = () => {
    setCreateForm({
      key: "",
      name: "",
      description: "",
      format: "generic",
      repo_type: "local",
      is_public: true,
    });
  };

  const handleCreateClose = (open: boolean) => {
    onCreateOpenChange(open);
    if (!open) {
      resetCreateForm();
    }
  };

  // --- Create Repository Dialog ---
  return (
    <>
      <Dialog open={createOpen} onOpenChange={handleCreateClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Repository</DialogTitle>
            <DialogDescription>
              Add a new artifact repository to your registry.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onCreateSubmit(createForm);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="create-key">Key</Label>
              <Input
                id="create-key"
                placeholder="my-repo"
                value={createForm.key}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, key: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                placeholder="My Repository"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-desc">Description</Label>
              <Textarea
                id="create-desc"
                placeholder="Optional description..."
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={createForm.format}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({
                      ...f,
                      format: v as RepositoryFormat,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={createForm.repo_type}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({
                      ...f,
                      repo_type: v as RepositoryType,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="create-public"
                checked={createForm.is_public}
                onCheckedChange={(v) =>
                  setCreateForm((f) => ({ ...f, is_public: v }))
                }
              />
              <Label htmlFor="create-public">Public repository</Label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => handleCreateClose(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createPending}>
                {createPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Edit Repository Dialog -- */}
      <Dialog open={editOpen} onOpenChange={onEditOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Repository: {editRepo?.key}</DialogTitle>
            <DialogDescription>
              Update the repository name, description, or visibility.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (editRepo) {
                onEditSubmit(editRepo.key, editForm);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="edit-public"
                checked={editForm.is_public}
                onCheckedChange={(v) =>
                  setEditForm((f) => ({ ...f, is_public: v }))
                }
              />
              <Label htmlFor="edit-public">Public repository</Label>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => onEditOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Delete Confirm Dialog -- */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={onDeleteOpenChange}
        title="Delete Repository"
        description={`Deleting "${deleteRepo?.key}" will permanently remove all artifacts and metadata. This action cannot be undone.`}
        typeToConfirm={deleteRepo?.key}
        confirmText="Delete Repository"
        danger
        loading={deletePending}
        onConfirm={() => {
          if (deleteRepo) onDeleteConfirm(deleteRepo.key);
        }}
      />
    </>
  );
}
