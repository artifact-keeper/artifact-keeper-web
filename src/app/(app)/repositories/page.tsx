"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RefreshCw,
} from "lucide-react";

import { repositoriesApi } from "@/lib/api/repositories";
import type {
  Repository,
  CreateRepositoryRequest,
  RepositoryFormat,
  RepositoryType,
} from "@/types";
import { formatBytes, REPO_TYPE_COLORS } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

// -- constants --

const FORMAT_OPTIONS: { value: RepositoryFormat; label: string; group: string }[] = [
  // Core package managers
  { value: "maven", label: "Maven", group: "Core" },
  { value: "gradle", label: "Gradle", group: "Core" },
  { value: "npm", label: "NPM", group: "Core" },
  { value: "pypi", label: "PyPI", group: "Core" },
  { value: "nuget", label: "NuGet", group: "Core" },
  { value: "go", label: "Go", group: "Core" },
  { value: "cargo", label: "Cargo", group: "Core" },
  { value: "rubygems", label: "RubyGems", group: "Core" },
  { value: "conan", label: "Conan (C/C++)", group: "Core" },
  { value: "composer", label: "Composer (PHP)", group: "Core" },
  { value: "hex", label: "Hex (Erlang/Elixir)", group: "Core" },
  { value: "pub", label: "Pub (Dart)", group: "Core" },
  { value: "sbt", label: "SBT (Scala)", group: "Core" },
  { value: "cran", label: "CRAN (R)", group: "Core" },
  { value: "generic", label: "Generic", group: "Core" },
  // Container / OCI
  { value: "docker", label: "Docker", group: "Container" },
  { value: "helm", label: "Helm", group: "Container" },
  { value: "podman", label: "Podman", group: "Container" },
  { value: "buildx", label: "Buildx", group: "Container" },
  { value: "oras", label: "ORAS", group: "Container" },
  { value: "wasm_oci", label: "WASM OCI", group: "Container" },
  { value: "helm_oci", label: "Helm OCI", group: "Container" },
  // Linux distro packages
  { value: "debian", label: "Debian/APT", group: "Linux" },
  { value: "rpm", label: "RPM/YUM", group: "Linux" },
  { value: "alpine", label: "Alpine APK", group: "Linux" },
  { value: "opkg", label: "OPKG", group: "Linux" },
  // Language ecosystem aliases
  { value: "poetry", label: "Poetry", group: "Ecosystem" },
  { value: "conda", label: "Conda", group: "Ecosystem" },
  { value: "conda_native", label: "Conda Native", group: "Ecosystem" },
  { value: "yarn", label: "Yarn", group: "Ecosystem" },
  { value: "pnpm", label: "PNPM", group: "Ecosystem" },
  { value: "bower", label: "Bower", group: "Ecosystem" },
  { value: "chocolatey", label: "Chocolatey", group: "Ecosystem" },
  { value: "powershell", label: "PowerShell", group: "Ecosystem" },
  { value: "cocoapods", label: "CocoaPods", group: "Ecosystem" },
  { value: "swift", label: "Swift", group: "Ecosystem" },
  // Infrastructure / IaC
  { value: "terraform", label: "Terraform", group: "Infrastructure" },
  { value: "opentofu", label: "OpenTofu", group: "Infrastructure" },
  { value: "chef", label: "Chef", group: "Infrastructure" },
  { value: "puppet", label: "Puppet", group: "Infrastructure" },
  { value: "ansible", label: "Ansible", group: "Infrastructure" },
  { value: "vagrant", label: "Vagrant", group: "Infrastructure" },
  // IDE extensions
  { value: "vscode", label: "VS Code Extensions", group: "Extensions" },
  { value: "jetbrains", label: "JetBrains Plugins", group: "Extensions" },
  // ML/AI
  { value: "huggingface", label: "HuggingFace", group: "ML/AI" },
  { value: "mlmodel", label: "ML Model", group: "ML/AI" },
  // Other
  { value: "gitlfs", label: "Git LFS", group: "Other" },
  { value: "bazel", label: "Bazel", group: "Other" },
  { value: "p2", label: "P2 (Eclipse)", group: "Other" },
];

const FORMAT_GROUPS = Array.from(
  FORMAT_OPTIONS.reduce((map, o) => {
    if (!map.has(o.group)) map.set(o.group, []);
    map.get(o.group)!.push(o);
    return map;
  }, new Map<string, typeof FORMAT_OPTIONS>())
);

const TYPE_OPTIONS: { value: RepositoryType; label: string }[] = [
  { value: "local", label: "Local" },
  { value: "remote", label: "Remote" },
  { value: "virtual", label: "Virtual" },
];

// -- page --

export default function RepositoriesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();

  // filter state
  const [formatFilter, setFormatFilter] = useState<string>("__all__");
  const [typeFilter, setTypeFilter] = useState<string>("__all__");
  const [searchQuery, setSearchQuery] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);

  // create form
  const [createForm, setCreateForm] = useState<CreateRepositoryRequest>({
    key: "",
    name: "",
    description: "",
    format: "generic",
    repo_type: "local",
    is_public: true,
  });

  // edit form
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    is_public: boolean;
  }>({ name: "", description: "", is_public: true });

  // --- queries ---
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "repositories",
      formatFilter === "__all__" ? undefined : formatFilter,
      typeFilter === "__all__" ? undefined : typeFilter,
      page,
      pageSize,
    ],
    queryFn: () =>
      repositoriesApi.list({
        per_page: pageSize,
        page,
        format: formatFilter === "__all__" ? undefined : formatFilter,
        repo_type: typeFilter === "__all__" ? undefined : typeFilter,
      }),
  });

  // --- mutations ---
  const createMutation = useMutation({
    mutationFn: (data: CreateRepositoryRequest) => repositoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setCreateOpen(false);
      resetCreateForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      key,
      data,
    }: {
      key: string;
      data: Partial<CreateRepositoryRequest>;
    }) => repositoriesApi.update(key, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setEditOpen(false);
      setSelectedRepo(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => repositoriesApi.delete(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      setDeleteOpen(false);
      setSelectedRepo(null);
    },
  });

  const resetCreateForm = useCallback(() => {
    setCreateForm({
      key: "",
      name: "",
      description: "",
      format: "generic",
      repo_type: "local",
      is_public: true,
    });
  }, []);

  const handleEdit = useCallback((repo: Repository) => {
    setSelectedRepo(repo);
    setEditForm({
      name: repo.name,
      description: repo.description ?? "",
      is_public: repo.is_public,
    });
    setEditOpen(true);
  }, []);

  const handleDelete = useCallback((repo: Repository) => {
    setSelectedRepo(repo);
    setDeleteOpen(true);
  }, []);

  // --- filter data locally by search ---
  const items = data?.items ?? [];
  const filtered = searchQuery
    ? items.filter(
        (r) =>
          r.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  // --- columns ---
  const columns: DataTableColumn<Repository>[] = [
    {
      id: "key",
      header: "Key",
      accessor: (r) => r.key,
      sortable: true,
      cell: (r) => (
        <button
          className="text-sm font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/repositories/${r.key}`);
          }}
        >
          {r.key}
        </button>
      ),
    },
    {
      id: "name",
      header: "Name",
      accessor: (r) => r.name,
      sortable: true,
      cell: (r) => <span className="text-sm">{r.name}</span>,
    },
    {
      id: "format",
      header: "Format",
      accessor: (r) => r.format,
      cell: (r) => (
        <Badge variant="secondary" className="text-xs font-normal">
          {r.format.toUpperCase()}
        </Badge>
      ),
    },
    {
      id: "repo_type",
      header: "Type",
      accessor: (r) => r.repo_type,
      cell: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REPO_TYPE_COLORS[r.repo_type] ?? ""}`}
        >
          {r.repo_type}
        </span>
      ),
    },
    {
      id: "storage",
      header: "Storage",
      accessor: (r) => r.storage_used_bytes,
      sortable: true,
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(r.storage_used_bytes)}
        </span>
      ),
    },
    {
      id: "visibility",
      header: "Visibility",
      accessor: (r) => (r.is_public ? "Public" : "Private"),
      cell: (r) => (
        <Badge variant={r.is_public ? "outline" : "secondary"} className="text-xs font-normal">
          {r.is_public ? "Public" : "Private"}
        </Badge>
      ),
    },
    ...(isAuthenticated && user?.is_admin
      ? [
          {
            id: "actions",
            header: "",
            cell: (r: Repository) => (
              <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleEdit(r)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(r)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </div>
            ),
          } as DataTableColumn<Repository>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage artifact repositories across all formats.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["repositories"] })
                }
              >
                <RefreshCw
                  className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          {isAuthenticated && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create Repository
            </Button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={formatFilter} onValueChange={(v) => { setFormatFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All formats</SelectItem>
            {FORMAT_GROUPS.map(([group, options]) => (
              <SelectGroup key={group}>
                <span className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group}</span>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All types</SelectItem>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search repositories..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {(formatFilter !== "__all__" || typeFilter !== "__all__" || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFormatFilter("__all__");
              setTypeFilter("__all__");
              setSearchQuery("");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={filtered}
        total={data?.pagination?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        loading={isLoading}
        emptyMessage="No repositories found."
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/repositories/${r.key}`)}
      />

      {/* -- Create Repository Dialog -- */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) resetCreateForm();
        }}
      >
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
              createMutation.mutate(createForm);
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
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Edit Repository Dialog -- */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setSelectedRepo(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Repository: {selectedRepo?.key}</DialogTitle>
            <DialogDescription>
              Update the repository name, description, or visibility.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedRepo) {
                updateMutation.mutate({
                  key: selectedRepo.key,
                  data: editForm,
                });
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
                onClick={() => {
                  setEditOpen(false);
                  setSelectedRepo(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* -- Delete Confirm Dialog -- */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setSelectedRepo(null);
        }}
        title="Delete Repository"
        description={`Deleting "${selectedRepo?.key}" will permanently remove all artifacts and metadata. This action cannot be undone.`}
        typeToConfirm={selectedRepo?.key}
        confirmText="Delete Repository"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (selectedRepo) deleteMutation.mutate(selectedRepo.key);
        }}
      />
    </div>
  );
}
