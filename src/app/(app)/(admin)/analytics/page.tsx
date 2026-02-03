"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  HardDrive,
  Package,
  Download,
  Clock,
  RefreshCw,
  Camera,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import analyticsApi from "@/lib/api/analytics";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle } from "@/components/ui/alert";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [staleDays, setStaleDays] = useState(90);

  const { data: growth, isLoading: growthLoading } = useQuery({
    queryKey: ["analytics-growth"],
    queryFn: () => analyticsApi.getGrowthSummary(),
    enabled: !!user?.is_admin,
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ["analytics-breakdown"],
    queryFn: () => analyticsApi.getStorageBreakdown(),
    enabled: !!user?.is_admin,
  });

  const { data: staleArtifacts, isLoading: staleLoading } = useQuery({
    queryKey: ["analytics-stale", staleDays],
    queryFn: () => analyticsApi.getStaleArtifacts({ days: staleDays, limit: 50 }),
    enabled: !!user?.is_admin,
  });

  const { data: storageTrend, isLoading: trendLoading } = useQuery({
    queryKey: ["analytics-trend"],
    queryFn: () => analyticsApi.getStorageTrend(),
    enabled: !!user?.is_admin,
  });

  const { data: downloadTrend, isLoading: downloadsLoading } = useQuery({
    queryKey: ["analytics-downloads"],
    queryFn: () => analyticsApi.getDownloadTrends(),
    enabled: !!user?.is_admin,
  });

  const snapshotMutation = useMutation({
    mutationFn: () => analyticsApi.captureSnapshot(),
    onSuccess: () => {
      toast.success("Snapshot captured successfully");
      queryClient.invalidateQueries({ queryKey: ["analytics-growth"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-trend"] });
    },
    onError: () => toast.error("Failed to capture snapshot"),
  });

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" />
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage Analytics"
        description="Storage growth, repository breakdown, and artifact usage insights."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["analytics-growth"] })
              }
            >
              <RefreshCw className="size-4 mr-1.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => snapshotMutation.mutate()}
              disabled={snapshotMutation.isPending}
            >
              <Camera className="size-4 mr-1.5" />
              Capture Snapshot
            </Button>
          </div>
        }
      />

      {/* Growth Summary Stats */}
      {growthLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : growth ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={HardDrive}
            label="Total Storage"
            value={formatBytes(growth.storage_bytes_end)}
            color="blue"
          />
          <StatCard
            icon={TrendingUp}
            label="Growth"
            value={
              growth.storage_growth_percent >= 0
                ? `+${growth.storage_growth_percent.toFixed(1)}%`
                : `${growth.storage_growth_percent.toFixed(1)}%`
            }
            color={growth.storage_growth_percent > 20 ? "yellow" : "green"}
          />
          <StatCard
            icon={Package}
            label="Artifacts"
            value={growth.artifacts_end.toLocaleString()}
            color="purple"
          />
          <StatCard
            icon={Clock}
            label="Stale Artifacts"
            value={staleArtifacts?.length ?? "..."}
            color={
              (staleArtifacts?.length ?? 0) > 10 ? "yellow" : "green"
            }
          />
        </div>
      ) : null}

      <Tabs defaultValue="breakdown">
        <TabsList>
          <TabsTrigger value="breakdown">
            <BarChart3 className="size-4 mr-1.5" />
            Breakdown
          </TabsTrigger>
          <TabsTrigger value="trend">
            <TrendingUp className="size-4 mr-1.5" />
            Storage Trend
          </TabsTrigger>
          <TabsTrigger value="downloads">
            <Download className="size-4 mr-1.5" />
            Downloads
          </TabsTrigger>
          <TabsTrigger value="stale">
            <Clock className="size-4 mr-1.5" />
            Stale Artifacts
          </TabsTrigger>
        </TabsList>

        {/* Repository Breakdown */}
        <TabsContent value="breakdown" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Storage by Repository
              </CardTitle>
              <CardDescription>
                Storage usage breakdown across all repositories.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {breakdownLoading ? (
                <div className="space-y-2 px-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !breakdown?.length ? (
                <div className="px-6 pb-4">
                  <EmptyState
                    icon={BarChart3}
                    title="No data yet"
                    description="Storage breakdown will appear after artifacts are uploaded."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Repository</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead className="text-right">Artifacts</TableHead>
                      <TableHead className="text-right">Storage</TableHead>
                      <TableHead className="text-right">Downloads</TableHead>
                      <TableHead>Last Upload</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.map((row) => (
                      <TableRow key={row.repository_id}>
                        <TableCell className="font-medium">
                          {row.repository_key}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.format}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.artifact_count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatBytes(row.storage_bytes)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.download_count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.last_upload_at
                            ? formatDate(row.last_upload_at)
                            : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage Trend */}
        <TabsContent value="trend" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Storage Over Time
              </CardTitle>
              <CardDescription>
                Daily snapshots of total storage usage.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {trendLoading ? (
                <div className="space-y-2 px-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !storageTrend?.length ? (
                <div className="px-6 pb-4">
                  <EmptyState
                    icon={TrendingUp}
                    title="No trend data yet"
                    description="Snapshots are captured daily. Data will appear within 24 hours."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Repos</TableHead>
                      <TableHead className="text-right">Artifacts</TableHead>
                      <TableHead className="text-right">Storage</TableHead>
                      <TableHead className="text-right">Downloads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storageTrend.map((row) => (
                      <TableRow key={row.snapshot_date}>
                        <TableCell className="font-medium">
                          {formatDate(row.snapshot_date)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.total_repositories}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.total_artifacts.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatBytes(row.total_storage_bytes)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.total_downloads.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Download Trends */}
        <TabsContent value="downloads" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Download Trends</CardTitle>
              <CardDescription>
                Daily download counts over the selected period.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {downloadsLoading ? (
                <div className="space-y-2 px-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !downloadTrend?.length ? (
                <div className="px-6 pb-4">
                  <EmptyState
                    icon={Download}
                    title="No download data yet"
                    description="Download trends will appear as artifacts are downloaded."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Downloads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {downloadTrend.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-medium">
                          {formatDate(row.date)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.download_count.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stale Artifacts */}
        <TabsContent value="stale" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Stale Artifacts</CardTitle>
                  <CardDescription>
                    Artifacts not downloaded in {staleDays}+ days.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {[30, 90, 180, 365].map((d) => (
                    <Button
                      key={d}
                      variant={staleDays === d ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStaleDays(d)}
                    >
                      {d}d
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {staleLoading ? (
                <div className="space-y-2 px-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : !staleArtifacts?.length ? (
                <div className="px-6 pb-4">
                  <EmptyState
                    icon={Clock}
                    title="No stale artifacts"
                    description={`All artifacts have been downloaded within the last ${staleDays} days.`}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Repository</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Days Stale</TableHead>
                      <TableHead className="text-right">Downloads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staleArtifacts.map((artifact) => (
                      <TableRow key={artifact.artifact_id}>
                        <TableCell
                          className="font-medium max-w-[200px] truncate"
                          title={artifact.path}
                        >
                          {artifact.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {artifact.repository_key}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatBytes(artifact.size_bytes)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              artifact.days_since_download > 180
                                ? "text-destructive font-medium"
                                : artifact.days_since_download > 90
                                  ? "text-amber-600"
                                  : ""
                            }
                          >
                            {artifact.days_since_download}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {artifact.download_count}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
