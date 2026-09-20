"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hammer, RefreshCw, ScrollText } from "lucide-react";

import { imageBuildsApi, isActiveBuild, shortDigest } from "@/lib/api/image-builds";
import type { ImageBuild, ImageBuildSettings } from "@/types/image-builds";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImageBuildWizard } from "./image-build-wizard";
import { ImageInspectPanel } from "./image-inspect-panel";

export function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "succeeded":
      return "default";
    case "failed":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function duration(build: ImageBuild): string {
  if (!build.started_at) return "—";
  const end = build.finished_at ? new Date(build.finished_at).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - new Date(build.started_at).getTime()) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/** One build's log (polled while it runs), Containerfile, and — once pushed — the image. */
function BuildDetail({
  repoKey,
  build,
  onRebuild,
}: {
  repoKey: string;
  build: ImageBuild;
  onRebuild: (b: ImageBuild) => void;
}) {
  const live = useQuery({
    queryKey: ["image-build", repoKey, build.id],
    queryFn: () => imageBuildsApi.get(repoKey, build.id),
    initialData: build,
    refetchInterval: (q) => (isActiveBuild((q.state.data as ImageBuild | undefined)?.status ?? "") ? 2000 : false),
  });
  const current = live.data ?? build;
  const log = useQuery({
    queryKey: ["image-build-log", repoKey, build.id, current.status],
    queryFn: () => imageBuildsApi.log(repoKey, build.id),
    refetchInterval: isActiveBuild(current.status) ? 2000 : false,
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
        <code className="font-mono text-xs">{current.reference}</code>
        {current.digest ? <code className="font-mono text-xs text-muted-foreground" title={current.digest}>{shortDigest(current.digest)}</code> : null}
        <span className="text-xs text-muted-foreground">by {current.requested_by} · {duration(current)}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => onRebuild(current)}>
          <RefreshCw className="size-3.5 mr-1" aria-hidden />
          Rebuild with changes
        </Button>
      </div>
      {current.error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{current.error}</div>
      ) : null}
      <Tabs defaultValue={current.status === "succeeded" ? "image" : "log"}>
        <TabsList variant="line">
          <TabsTrigger value="log"><ScrollText className="size-3.5 mr-1" />Log</TabsTrigger>
          <TabsTrigger value="containerfile">Containerfile</TabsTrigger>
          {current.status === "succeeded" ? <TabsTrigger value="image">Image</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="log">
          <pre className="max-h-[50vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre-wrap" data-testid="build-log">
            {log.data ?? (log.isLoading ? "Loading log…" : "")}
          </pre>
        </TabsContent>
        <TabsContent value="containerfile">
          <pre className="max-h-[50vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre">{current.containerfile}</pre>
        </TabsContent>
        {current.status === "succeeded" ? (
          <TabsContent value="image">
            <ImageInspectPanel repoKey={repoKey} image={current.image} reference={current.tag} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

/**
 * Build tab of a container repository: what the builder can do here, the
 * builds so far, and the New image wizard. Builds refresh every few
 * seconds while any is queued or running.
 */
export function ImageBuildTab({ repoKey, canBuild }: { repoKey: string; canBuild: boolean }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  // Bumped on every open so the wizard mounts fresh with its initial form.
  const [wizardKey, setWizardKey] = useState(0);
  const [rebuildFrom, setRebuildFrom] = useState<ImageBuild | null>(null);
  const openWizard = (from: ImageBuild | null) => {
    setRebuildFrom(from);
    setWizardKey((k) => k + 1);
    setWizardOpen(true);
  };
  const [selected, setSelected] = useState<ImageBuild | null>(null);
  const settings = useQuery({
    queryKey: ["image-build-settings", repoKey],
    queryFn: () => imageBuildsApi.settings(repoKey),
    retry: false,
  });
  const builds = useQuery({
    queryKey: ["image-builds", repoKey],
    queryFn: () => imageBuildsApi.list(repoKey),
    retry: false,
    refetchInterval: (q) => {
      const items = (q.state.data as { items: ImageBuild[] } | undefined)?.items ?? [];
      return items.some((b) => isActiveBuild(b.status)) ? 3000 : false;
    },
  });
  const s: ImageBuildSettings | undefined = settings.data;
  // The server's verdict wins when it gives one (admin-only policy, write
  // access); older backends without the field fall back to the client's.
  const callerMayBuild = s?.caller_may_build ?? canBuild;
  const buildable = !!s && s.enabled && s.repository_buildable && callerMayBuild;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hammer className="size-4" aria-hidden />
              Image builder
            </CardTitle>
            <CardDescription className="mt-1">
              Compose an image from an approved base plus packages, env and labels; the server
              renders the Containerfile, BuildKit builds and pushes it here with a provenance
              attestation. Every pushed image is scanned like any other.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => openWizard(null)} disabled={!buildable}>
            <Hammer className="size-4 mr-1" aria-hidden />
            New image
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {settings.isError ? (
            "This backend does not expose the image builder."
          ) : !s ? (
            "Checking builder…"
          ) : !s.enabled ? (
            "Builds are not configured on this instance (AK_BUILDKIT_ADDR / AK_IMAGE_BUILD_PUSH_REGISTRY). Inspection still works."
          ) : !s.repository_buildable ? (
            "Builds push into local container repositories; this repository is remote or virtual."
          ) : !callerMayBuild ? (
            s.admin_only
              ? "Image builds are restricted to administrators on this instance (AK_IMAGE_BUILD_ADMIN_ONLY)."
              : "You need write access to this repository to build into it."
          ) : (
            <span>
              Base images{s.base_allowlist.length ? ` under ${s.base_allowlist.join(", ")}` : ": any"} ·
              {s.allow_run ? " raw RUN lines allowed" : " no raw RUN lines"} ·
              {s.admin_only ? " administrators only" : " repository writers"} · up to {s.max_concurrent} concurrent ·
              {" "}{Math.round(s.timeout_secs / 60)} min timeout · pushes via {s.push_registry ?? "?"}
              {s.pip_index_url ? ` · pip via ${s.pip_index_url}` : ""}
            </span>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Digest</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {builds.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading builds…</TableCell></TableRow>
            ) : builds.isError ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Builds are not available on this backend.</TableCell></TableRow>
            ) : (builds.data?.items.length ?? 0) === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No builds yet.{buildable ? " Start with New image." : ""}</TableCell></TableRow>
            ) : (
              builds.data!.items.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => setSelected(b)}>
                  <TableCell className="font-mono text-xs">{b.image}:{b.tag}</TableCell>
                  <TableCell><Badge variant={statusVariant(b.status)}>{b.status}</Badge></TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{b.spec.base_image}</TableCell>
                  <TableCell className="font-mono text-xs" title={b.digest ?? undefined}>{b.digest ? shortDigest(b.digest) : "—"}</TableCell>
                  <TableCell className="text-xs">{b.requested_by}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{when(b.started_at ?? b.created_at)}</TableCell>
                  <TableCell className="text-xs">{duration(b)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {s ? (
        <ImageBuildWizard
          key={wizardKey}
          repoKey={repoKey}
          settings={s}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          initialSpec={rebuildFrom?.spec ?? null}
        />
      ) : null}

      <Dialog open={selected != null} onOpenChange={(o) => (!o ? setSelected(null) : undefined)}>
        <DialogContent className="max-h-[90vh] w-[min(64rem,calc(100vw-2rem))] max-w-[calc(100%-2rem)] sm:max-w-none overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{selected?.reference}</DialogTitle>
            <DialogDescription>Build {selected?.id}</DialogDescription>
          </DialogHeader>
          {selected ? (
            <BuildDetail
              repoKey={repoKey}
              build={selected}
              onRebuild={(b) => {
                setSelected(null);
                openWizard(b);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
