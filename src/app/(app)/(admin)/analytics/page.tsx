"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { analyticsApi } from "@/lib/api/analytics";
import { mutationErrorToast } from "@/lib/error-utils";
import { formatBytes, formatDate } from "@/lib/utils";
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

export default function AnalyticsPage() {
  const t = useTranslations("adminAnalytics");
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
      toast.success(t("snapshotCaptured"));
      queryClient.invalidateQueries({ queryKey: ["analytics-growth"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-trend"] });
    },
    onError: mutationErrorToast(t("snapshotFailed")),
  });

  if (!user?.is_admin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("accessTitle")} />
        <Alert variant="destructive">
          <AlertTitle>{t("accessDenied")}</AlertTitle>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
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
              {t("refresh")}
            </Button>
            <Button
              size="sm"
              onClick={() => snapshotMutation.mutate()}
              disabled={snapshotMutation.isPending}
            >
              <Camera className="size-4 mr-1.5" />
              {t("captureSnapshot")}
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
            label={t("statTotalStorage")}
            value={formatBytes(growth.storage_bytes_end)}
            color="blue"
          />
          <StatCard
            icon={TrendingUp}
            label={t("statGrowth")}
            value={
              growth.storage_growth_percent >= 0
                ? `+${growth.storage_growth_percent.toFixed(1)}%`
                : `${growth.storage_growth_percent.toFixed(1)}%`
            }
            color={growth.storage_growth_percent > 20 ? "yellow" : "green"}
          />
          <StatCard
            icon={Package}
            label={t("statArtifacts")}
            value={growth.artifacts_end.toLocaleString()}
            color="purple"
          />
          <StatCard
            icon={Clock}
            label={t("statStaleArtifacts")}
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
            {t("tabBreakdown")}
          </TabsTrigger>
          <TabsTrigger value="trend">
            <TrendingUp className="size-4 mr-1.5" />
            {t("tabTrend")}
          </TabsTrigger>
          <TabsTrigger value="downloads">
            <Download className="size-4 mr-1.5" />
            {t("tabDownloads")}
          </TabsTrigger>
          <TabsTrigger value="stale">
            <Clock className="size-4 mr-1.5" />
            {t("tabStale")}
          </TabsTrigger>
        </TabsList>

        {/* Repository Breakdown */}
        <TabsContent value="breakdown" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("breakdownTitle")}
              </CardTitle>
              <CardDescription>
                {t("breakdownDescription")}
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
                    title={t("noDataTitle")}
                    description={t("noDataDescription")}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colRepository")}</TableHead>
                      <TableHead>{t("colFormat")}</TableHead>
                      <TableHead className="text-right">{t("colArtifacts")}</TableHead>
                      <TableHead className="text-right">{t("colStorage")}</TableHead>
                      <TableHead className="text-right">{t("colDownloads")}</TableHead>
                      <TableHead>{t("colLastUpload")}</TableHead>
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
                            : t("never")}
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
                {t("trendTitle")}
              </CardTitle>
              <CardDescription>
                {t("trendDescription")}
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
                    title={t("noTrendTitle")}
                    description={t("noTrendDescription")}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colDate")}</TableHead>
                      <TableHead className="text-right">{t("colRepos")}</TableHead>
                      <TableHead className="text-right">{t("colArtifacts")}</TableHead>
                      <TableHead className="text-right">{t("colStorage")}</TableHead>
                      <TableHead className="text-right">{t("colDownloads")}</TableHead>
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
              <CardTitle className="text-base">{t("downloadsTitle")}</CardTitle>
              <CardDescription>
                {t("downloadsDescription")}
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
                    title={t("noDownloadsTitle")}
                    description={t("noDownloadsDescription")}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colDate")}</TableHead>
                      <TableHead className="text-right">{t("colDownloads")}</TableHead>
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
                  <CardTitle className="text-base">{t("staleTitle")}</CardTitle>
                  <CardDescription>
                    {t("staleDescription", { days: staleDays })}
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
                    title={t("noStaleTitle")}
                    description={t("noStaleDescription", { days: staleDays })}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colName")}</TableHead>
                      <TableHead>{t("colRepository")}</TableHead>
                      <TableHead className="text-right">{t("colSize")}</TableHead>
                      <TableHead className="text-right">{t("colDaysStale")}</TableHead>
                      <TableHead className="text-right">{t("colDownloads")}</TableHead>
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
