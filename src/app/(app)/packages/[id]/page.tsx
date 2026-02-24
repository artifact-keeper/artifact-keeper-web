"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  Check,
  ArrowLeft,
  Package,
  ExternalLink,
  Tag,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { packagesApi } from "@/lib/api/packages";
import { getInstallCommand } from "@/lib/package-utils";
import {
  formatBytes as formatBytesUtil,
  formatDate,
  formatNumber,
  isSafeUrl,
} from "@/lib/utils";
import { FileTree } from "@/components/package/file-tree";
import type { PackageVersion } from "@/types/packages";

// ---- Helpers ----

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "--";
  return formatBytesUtil(bytes);
}

// ---- Install Command Block ----

function InstallCommandBlock({
  command,
}: {
  command: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [command]);

  return (
    <div className="relative">
      <pre className="rounded-lg bg-muted p-3 pr-10 text-xs font-mono overflow-x-auto">
        {command}
      </pre>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleCopy}
        className="absolute top-2 right-2"
      >
        {copied ? (
          <Check className="size-3 text-green-500" />
        ) : (
          <Copy className="size-3" />
        )}
      </Button>
    </div>
  );
}

// ---- Version Install Copy Button ----

function VersionCopyButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [command]);

  return (
    <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
      {copied ? (
        <Check className="size-3 text-green-500" />
      ) : (
        <Copy className="size-3" />
      )}
    </Button>
  );
}

// ---- Metadata Item ----

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 truncate">{value}</p>
    </div>
  );
}

// ---- Main Page ----

export default function PackageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const packageId = params.id as string;

  // Fetch package
  const {
    data: pkg,
    isLoading: pkgLoading,
    error: pkgError,
  } = useQuery({
    queryKey: ["package-detail", packageId],
    queryFn: () => packagesApi.get(packageId),
    enabled: !!packageId,
  });

  // Fetch versions
  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ["package-versions", packageId],
    queryFn: () => packagesApi.getVersions(packageId),
    enabled: !!packageId,
  });

  // Loading state
  if (pkgLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <Skeleton className="h-4 w-48" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (pkgError || !pkg) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-1.5 mb-6"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="size-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            Package not found
          </p>
        </div>
      </div>
    );
  }

  const installCmd = getInstallCommand(pkg.name, pkg.version, pkg.format);
  const license = (pkg.metadata as Record<string, unknown> | undefined)
    ?.license as string | undefined;
  const author = (pkg.metadata as Record<string, unknown> | undefined)
    ?.author as string | undefined;
  const homepageUrl = (pkg.metadata as Record<string, unknown> | undefined)
    ?.homepage_url as string | undefined;

  const sortedVersions = [...(versions ?? [])].sort((a, b) => {
    // Sort by created_at descending (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/packages">Packages</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pkg.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="gap-1.5"
      >
        <ArrowLeft className="size-4" />
        Back
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold truncate">{pkg.name}</h1>
            <Badge variant="secondary">{pkg.format}</Badge>
          </div>
          {pkg.version && (
            <p className="text-sm text-muted-foreground mt-1">
              Latest: v{pkg.version}
            </p>
          )}
          {pkg.description && (
            <p className="text-sm text-muted-foreground mt-2">
              {pkg.description}
            </p>
          )}
        </div>
        {homepageUrl && isSafeUrl(homepageUrl) ? (
          <Button variant="outline" size="sm" asChild>
            <a
              href={homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="gap-1.5"
            >
              <ExternalLink className="size-3.5" />
              Homepage
            </a>
          </Button>
        ) : homepageUrl ? (
          <span className="text-sm text-muted-foreground">{homepageUrl}</span>
        ) : null}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="versions">
            Versions
            {sortedVersions.length > 0 ? ` (${sortedVersions.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          {/* Install command */}
          <div>
            <h3 className="text-sm font-medium mb-2">Install</h3>
            <InstallCommandBlock command={installCmd} />
          </div>

          {/* Metadata grid */}
          <div>
            <h3 className="text-sm font-medium mb-2">Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetadataItem label="Format" value={pkg.format} />
              <MetadataItem label="Repository" value={pkg.repository_key} />
              {license && <MetadataItem label="License" value={license} />}
              {author && <MetadataItem label="Author" value={author} />}
              <MetadataItem
                label="Size"
                value={formatBytes(pkg.size_bytes)}
              />
              <MetadataItem
                label="Downloads"
                value={formatNumber(pkg.download_count)}
              />
              <MetadataItem
                label="Created"
                value={formatDate(pkg.created_at)}
              />
              <MetadataItem
                label="Updated"
                value={formatDate(pkg.updated_at)}
              />
            </div>
          </div>

          {homepageUrl && (
            <div>
              <h3 className="text-sm font-medium mb-2">Links</h3>
              {isSafeUrl(homepageUrl) ? (
                <a
                  href={homepageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  {homepageUrl}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ExternalLink className="size-3.5" />
                  {homepageUrl}
                </span>
              )}
            </div>
          )}
        </TabsContent>

        {/* Versions Tab */}
        <TabsContent value="versions" className="pt-4">
          {versionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : sortedVersions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Tag className="size-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No version information available
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-right">Downloads</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Install Command</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedVersions.map((v: PackageVersion) => {
                  const versionInstallCmd = getInstallCommand(
                    pkg.name,
                    v.version,
                    pkg.format
                  );
                  return (
                    <TableRow key={v.version}>
                      <TableCell>
                        <span className="font-medium font-mono text-xs">
                          {v.version}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatBytes(v.size_bytes)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatNumber(v.download_count)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(v.created_at)}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded max-w-[200px] truncate block">
                          {versionInstallCmd}
                        </code>
                      </TableCell>
                      <TableCell>
                        <VersionCopyButton command={versionInstallCmd} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files" className="pt-4">
          <div className="border rounded-lg">
            <FileTree
              repositoryKey={pkg.repository_key}
              rootPath={`/${pkg.name}`}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
