"use client";

import { useState, useMemo, useEffect } from "react";
import type { Repository, CreateRepositoryRequest, RepositoryFormat, RepositoryType, VirtualRepoMemberInput } from "@/types";
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
  // Available repos for virtual repo member selection
  availableRepos?: Repository[];
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
  availableRepos = [],
}: RepoDialogsProps) {
  // Create form state
  const [createForm, setCreateForm] = useState<CreateRepositoryRequest>({
    key: "",
    name: "",
    description: "",
    format: "generic",
    repo_type: "local",
    is_public: true,
    upstream_url: "",
    member_repos: [],
  });

  // For virtual repos: selected member repo keys
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Key validation - check if key is already taken
  const [keyTaken, setKeyTaken] = useState(false);

  useEffect(() => {
    if (!createForm.key || createForm.key.length < 2) {
      setKeyTaken(false);
      return;
    }

    // Check if key exists in availableRepos
    const exists = availableRepos.some(
      (r) => r.key.toLowerCase() === createForm.key.toLowerCase()
    );
    setKeyTaken(exists);
  }, [createForm.key, availableRepos]);

  // Filter repos that can be members (local and remote, same format)
  const eligibleMembers = useMemo(() => {
    return availableRepos.filter(
      (r) => (r.repo_type === "local" || r.repo_type === "remote") &&
             r.format === createForm.format
    );
  }, [availableRepos, createForm.format]);

  // Edit form state — derived from editRepo, with local overrides
  const editFormDefaults = useMemo(() => ({
    name: editRepo?.name ?? "",
    description: editRepo?.description ?? "",
    is_public: editRepo?.is_public ?? true,
  }), [editRepo]);
  const [editFormOverrides, setEditFormOverrides] = useState<{
    name?: string;
    description?: string;
    is_public?: boolean;
  }>({});
  const editForm = { ...editFormDefaults, ...editFormOverrides };

  const resetCreateForm = () => {
    setCreateForm({
      key: "",
      name: "",
      description: "",
      format: "generic",
      repo_type: "local",
      is_public: true,
      upstream_url: "",
      member_repos: [],
    });
    setSelectedMembers([]);
  };

  // Build member_repos array from selected keys
  const buildMemberRepos = (): VirtualRepoMemberInput[] => {
    return selectedMembers.map((key, idx) => ({
      repo_key: key,
      priority: idx + 1,
    }));
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
              const submitData: CreateRepositoryRequest = {
                ...createForm,
                upstream_url: createForm.repo_type === "remote" ? createForm.upstream_url : undefined,
                member_repos: createForm.repo_type === "virtual" ? buildMemberRepos() : undefined,
              };
              onCreateSubmit(submitData);
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
                className={keyTaken ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {keyTaken && (
                <p className="text-sm text-red-500">
                  Repository key "{createForm.key}" is already taken. Please choose a different key.
                </p>
              )}
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
            {/* Remote repository: upstream URL */}
            {createForm.repo_type === "remote" && (
              <div className="space-y-2">
                <Label htmlFor="create-upstream">Upstream URL</Label>
                <Input
                  id="create-upstream"
                  placeholder="https://registry.npmjs.org"
                  value={createForm.upstream_url || ""}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, upstream_url: e.target.value }))
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The upstream registry URL to proxy requests to.
                </p>
              </div>
            )}

            {/* Virtual repository: member selection */}
            {createForm.repo_type === "virtual" && (
              <div className="space-y-2">
                <Label>Member Repositories</Label>
                {eligibleMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No {createForm.format} local or remote repositories available. Create some first.
                  </p>
                ) : (
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {eligibleMembers.map((repo) => (
                      <label
                        key={repo.key}
                        className="flex items-center gap-2 p-1 hover:bg-muted rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(repo.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMembers((m) => [...m, repo.key]);
                            } else {
                              setSelectedMembers((m) => m.filter((k) => k !== repo.key));
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{repo.name}</span>
                        <span className="text-xs text-muted-foreground">({repo.repo_type})</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Select repositories to aggregate. Order determines priority.
                </p>
              </div>
            )}

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
              <Button type="submit" disabled={createPending || keyTaken}>
                {createPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Edit Repository Dialog -- */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditFormOverrides({}); onEditOpenChange(open); }}>
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
                  setEditFormOverrides((f) => ({ ...f, name: e.target.value }))
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
                  setEditFormOverrides((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="edit-public"
                checked={editForm.is_public}
                onCheckedChange={(v) =>
                  setEditFormOverrides((f) => ({ ...f, is_public: v }))
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
