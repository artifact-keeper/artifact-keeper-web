"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Trash2,
  Search,
  FileIcon,
  Info,
  Shield,
} from "lucide-react";

import { repositoriesApi } from "@/lib/api/repositories";
import { artifactsApi } from "@/lib/api/artifacts";
import securityApi from "@/lib/api/security";
import type { Artifact } from "@/types";
import type { UpsertScanConfigRequest } from "@/types/security";
import { useAuth } from "@/providers/auth-provider";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { DataTable, type DataTableColumn } from "@/components/common/data-table";
import { CopyButton } from "@/components/common/copy-button";
import { FileUpload } from "@/components/common/file-upload";

// -- helpers --

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const TYPE_COLORS: Record<string, string> = {
  local: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  remote: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  virtual: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

// -- page --

export default function RepositoryDetailPage() {
  const params = useParams<{ key: string }>();
  const repoKey = params.key;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();

  // artifact search / pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // artifact detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  // security form local state
  const [secForm, setSecForm] = useState<UpsertScanConfigRequest | null>(null);

  // --- queries ---
  const { data: repository, isLoading: repoLoading } = useQuery({
    queryKey: ["repository", repoKey],
    queryFn: () => repositoriesApi.get(repoKey),
    enabled: !!repoKey,
  });

  const { data: artifactsData, isLoading: artifactsLoading } = useQuery({
    queryKey: ["artifacts", repoKey, searchQuery, page, pageSize],
    queryFn: () =>
      artifactsApi.list(repoKey, {
        search: searchQuery || undefined,
        per_page: pageSize,
        page,
      }),
    enabled: !!repoKey,
  });

  const { data: repoSecurity, isLoading: securityLoading } = useQuery({
    queryKey: ["repository-security", repoKey],
    queryFn: () => securityApi.getRepoSecurity(repoKey),
    enabled: !!repoKey && !!user?.is_admin,
  });

  // initialise security form from fetched data
  const securityDefaults: UpsertScanConfigRequest = {
    scan_enabled: repoSecurity?.config?.scan_enabled ?? false,
    scan_on_upload: repoSecurity?.config?.scan_on_upload ?? true,
    scan_on_proxy: repoSecurity?.config?.scan_on_proxy ?? false,
    block_on_policy_violation: repoSecurity?.config?.block_on_policy_violation ?? false,
    severity_threshold: repoSecurity?.config?.severity_threshold ?? "high",
  };
  const currentSecForm = secForm ?? securityDefaults;

  // --- mutations ---
  const deleteMutation = useMutation({
    mutationFn: (path: string) => artifactsApi.delete(repoKey, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["artifacts", repoKey] });
      queryClient.invalidateQueries({ queryKey: ["repository", repoKey] });
      setDetailOpen(false);
      setSelectedArtifact(null);
    },
  });

  const updateSecurityMutation = useMutation({
    mutationFn: (values: UpsertScanConfigRequest) =>
      securityApi.updateRepoSecurity(repoKey, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repository-security", repoKey] });
    },
  });

  // --- handlers ---
  const handleDownload = useCallback(
    (artifact: Artifact) => {
      const url = artifactsApi.getDownloadUrl(repoKey, artifact.path);
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const link = document.createElement("a");
      link.href = token ? `${url}?token=${token}` : url;
      link.download = artifact.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [repoKey]
  );

  const handleUpload = useCallback(
    async (file: File, path?: string) => {
      await artifactsApi.upload(repoKey, file, path);
      queryClient.invalidateQueries({ queryKey: ["artifacts", repoKey] });
      queryClient.invalidateQueries({ queryKey: ["repository", repoKey] });
    },
    [repoKey, queryClient]
  );

  const showDetail = useCallback((artifact: Artifact) => {
    setSelectedArtifact(artifact);
    setDetailOpen(true);
  }, []);

  // --- artifact columns ---
  const artifactColumns: DataTableColumn<Artifact>[] = [
    {
      id: "name",
      header: "Name",
      accessor: (a) => a.name,
      sortable: true,
      cell: (a) => (
        <button
          className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            showDetail(a);
          }}
        >
          <FileIcon className="size-4 text-muted-foreground" />
          {a.name}
        </button>
      ),
    },
    {
      id: "path",
      header: "Path",
      accessor: (a) => a.path,
      cell: (a) => (
        <code className="text-xs text-muted-foreground max-w-[200px] truncate block">
          {a.path}
        </code>
      ),
    },
    {
      id: "version",
      header: "Version",
      accessor: (a) => a.version ?? "",
      cell: (a) =>
        a.version ? (
          <Badge variant="outline" className="text-xs font-normal">
            {a.version}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      id: "size",
      header: "Size",
      accessor: (a) => a.size_bytes,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {formatBytes(a.size_bytes)}
        </span>
      ),
    },
    {
      id: "downloads",
      header: "Downloads",
      accessor: (a) => a.download_count,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {a.download_count.toLocaleString()}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      accessor: (a) => a.created_at,
      sortable: true,
      cell: (a) => (
        <span className="text-sm text-muted-foreground">
          {new Date(a.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (a) => (
        <div
          className="flex items-center gap-1 justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => showDetail(a)}
              >
                <Info className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Details</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleDownload(a)}
              >
                <Download className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>
          {isAuthenticated && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(a.path)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  // --- loading / not found ---
  if (repoLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!repository) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-lg font-medium">Repository not found</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/repositories")}
        >
          Back to Repositories
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/repositories">Repositories</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{repository.key}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Repo metadata header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push("/repositories")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {repository.name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {repository.format.toUpperCase()}
          </Badge>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[repository.repo_type] ?? ""}`}
          >
            {repository.repo_type}
          </span>
          <Badge
            variant={repository.is_public ? "outline" : "secondary"}
            className="text-xs font-normal"
          >
            {repository.is_public ? "Public" : "Private"}
          </Badge>
          <span className="text-sm text-muted-foreground ml-2">
            {formatBytes(repository.storage_used_bytes)} used
          </span>
        </div>

        {repository.description && (
          <p className="text-sm text-muted-foreground max-w-2xl">
            {repository.description}
          </p>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="artifacts">
        <TabsList variant="line">
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          {isAuthenticated && <TabsTrigger value="upload">Upload</TabsTrigger>}
          {user?.is_admin && (
            <TabsTrigger value="security">
              <Shield className="size-3.5 mr-1" />
              Security
            </TabsTrigger>
          )}
        </TabsList>

        {/* --- Artifacts Tab --- */}
        <TabsContent value="artifacts" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search artifacts..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <DataTable
            columns={artifactColumns}
            data={artifactsData?.items ?? []}
            total={artifactsData?.pagination?.total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            loading={artifactsLoading}
            emptyMessage="No artifacts in this repository."
            rowKey={(a) => a.id}
            onRowClick={showDetail}
          />
        </TabsContent>

        {/* --- Upload Tab --- */}
        {isAuthenticated && (
          <TabsContent value="upload" className="mt-4">
            <div className="max-w-lg">
              <h3 className="text-sm font-medium mb-4">
                Upload an artifact to {repository.key}
              </h3>
              <FileUpload onUpload={handleUpload} showPathInput />
            </div>
          </TabsContent>
        )}

        {/* --- Security Tab --- */}
        {user?.is_admin && (
          <TabsContent value="security" className="mt-4">
            {securityLoading ? (
              <div className="space-y-3 max-w-md">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <form
                className="space-y-5 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateSecurityMutation.mutate(currentSecForm);
                }}
              >
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-enabled">Enable Scanning</Label>
                  <Switch
                    id="sec-enabled"
                    checked={currentSecForm.scan_enabled}
                    onCheckedChange={(v) =>
                      setSecForm({ ...currentSecForm, scan_enabled: v })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-upload">Scan on Upload</Label>
                  <Switch
                    id="sec-upload"
                    checked={currentSecForm.scan_on_upload}
                    onCheckedChange={(v) =>
                      setSecForm({ ...currentSecForm, scan_on_upload: v })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-proxy">Scan on Proxy</Label>
                  <Switch
                    id="sec-proxy"
                    checked={currentSecForm.scan_on_proxy}
                    onCheckedChange={(v) =>
                      setSecForm({ ...currentSecForm, scan_on_proxy: v })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sec-block">Block on Violation</Label>
                  <Switch
                    id="sec-block"
                    checked={currentSecForm.block_on_policy_violation}
                    onCheckedChange={(v) =>
                      setSecForm({
                        ...currentSecForm,
                        block_on_policy_violation: v,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Severity Threshold</Label>
                  <Select
                    value={currentSecForm.severity_threshold}
                    onValueChange={(v) =>
                      setSecForm({ ...currentSecForm, severity_threshold: v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={updateSecurityMutation.isPending}
                >
                  {updateSecurityMutation.isPending
                    ? "Saving..."
                    : "Save Settings"}
                </Button>
              </form>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* --- Artifact Detail Dialog --- */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileIcon className="size-4" />
              Artifact Details
            </DialogTitle>
          </DialogHeader>
          {selectedArtifact && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Name" value={selectedArtifact.name} />
              <DetailRow label="Path" value={selectedArtifact.path} copy />
              {selectedArtifact.version && (
                <DetailRow label="Version" value={selectedArtifact.version} />
              )}
              <DetailRow
                label="Size"
                value={`${formatBytes(selectedArtifact.size_bytes)} (${selectedArtifact.size_bytes.toLocaleString()} bytes)`}
              />
              <DetailRow
                label="Content Type"
                value={selectedArtifact.content_type}
              />
              <DetailRow
                label="Downloads"
                value={selectedArtifact.download_count.toLocaleString()}
              />
              <DetailRow
                label="Created"
                value={new Date(selectedArtifact.created_at).toLocaleString()}
              />
              <DetailRow
                label="SHA-256"
                value={selectedArtifact.checksum_sha256}
                copy
                mono
              />
              <DetailRow
                label="Download URL"
                value={artifactsApi.getDownloadUrl(repoKey, selectedArtifact.path)}
                copy
                mono
              />
              {selectedArtifact.metadata &&
                Object.keys(selectedArtifact.metadata).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Metadata
                    </p>
                    <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-40">
                      {JSON.stringify(selectedArtifact.metadata, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailOpen(false)}
            >
              Close
            </Button>
            {selectedArtifact && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (selectedArtifact) deleteMutation.mutate(selectedArtifact.path);
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
                <Button onClick={() => selectedArtifact && handleDownload(selectedArtifact)}>
                  <Download className="size-4" />
                  Download
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -- detail row helper --

function DetailRow({
  label,
  value,
  copy,
  mono,
}: {
  label: string;
  value: string;
  copy?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
      <span className="text-muted-foreground text-xs font-medium pt-0.5">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span
          className={`break-all ${mono ? "font-mono text-xs" : ""}`}
          title={value}
        >
          {value}
        </span>
        {copy && <CopyButton value={value} />}
      </div>
    </div>
  );
}
