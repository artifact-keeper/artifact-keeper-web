"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileCode2, Layers3, ShieldCheck } from "lucide-react";

import { imageBuildsApi, dockerfileLines, shortDigest } from "@/lib/api/image-builds";
import type { ImageInspect } from "@/types/image-builds";
import { formatBytes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/fetch";

/**
 * Formats whose repositories hold runnable container images — the set the
 * backend's image builder/inspector serves (`is_container_image_repo`).
 * Narrower than the Docker family used for grouped views: Helm-as-OCI and
 * WASM-as-OCI share the manifest layout but are not container images.
 */
export const CONTAINER_IMAGE_FORMATS: ReadonlySet<string> = new Set([
  "docker",
  "podman",
  "buildx",
  "oras",
]);

export function isContainerImageFormat(format: string | null | undefined): boolean {
  return !!format && CONTAINER_IMAGE_FORMATS.has(format);
}

/** `v2/<image>/manifests/<ref>` → the pieces the inspect endpoint takes. */
export function manifestPathParts(
  path: string,
): { image: string; reference: string } | null {
  const m = (path ?? "").replace(/^\/+/, "").match(/^v2\/(.+)\/manifests\/([^/]+)$/);
  return m ? { image: m[1], reference: m[2] } : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm border-b last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Argv({ argv }: { argv: string[] }) {
  if (argv.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <code className="font-mono text-xs">
      {argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}
    </code>
  );
}

function PairTable({
  pairs,
  keyHeader,
  empty,
}: {
  pairs: Record<string, string>;
  keyHeader: string;
  empty: string;
}) {
  const entries = Object.entries(pairs).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{keyHeader}</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([k, v]) => (
            <TableRow key={k}>
              <TableCell className="font-mono text-xs">{k}</TableCell>
              <TableCell className="font-mono text-xs [overflow-wrap:anywhere] whitespace-normal">{v}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The Dockerfile view: the real one from a BuildKit `mode=max` provenance
 * attestation when the image carries it, else the build history the image
 * config records, rendered as instructions with the layer size each step
 * produced.
 */
export function DockerfileView({ doc }: { doc: ImageInspect }) {
  const real = doc.provenance?.dockerfile;
  if (real) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden />
          The actual {doc.provenance?.dockerfile_name ?? "Dockerfile"}, from the image&apos;s
          signed provenance attestation ({shortDigest(doc.provenance?.attestation_digest)}).
        </p>
        <pre
          data-testid="dockerfile-real"
          className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre"
        >
          {real}
        </pre>
      </div>
    );
  }
  const lines = dockerfileLines(doc.history);
  if (lines.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        This image records no build history; only its layers are known.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Reconstructed from the recorded build history — the closest an image without a
        provenance attestation gets to its Dockerfile. Sizes are the compressed layer each
        step produced.
      </p>
      <ol data-testid="dockerfile-history" className="min-w-0 divide-y overflow-hidden rounded-md border bg-muted/40 font-mono text-xs">
        {lines.map((line, i) => (
          <li key={i} className="flex min-w-0 items-start gap-3 px-3 py-1.5">
            <span className="w-6 shrink-0 select-none text-right text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
              <span
                className={
                  line.instruction === "FROM"
                    ? "font-semibold text-sky-600 dark:text-sky-400"
                    : "font-semibold text-emerald-600 dark:text-emerald-400"
                }
              >
                {line.instruction}
              </span>
              {line.text.slice(line.instruction.length)}
            </span>
            <span className="shrink-0 text-muted-foreground" title={line.layerDigest ?? undefined}>
              {line.emptyLayer ? "" : formatBytes(line.sizeBytes ?? 0)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ImageInspectView({ doc }: { doc: ImageInspect }) {
  const [tab, setTab] = useState("overview");
  const total = doc.size_bytes || 1;
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-3">
      <TabsList variant="line">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="dockerfile">
          <FileCode2 className="size-3.5 mr-1" />
          Dockerfile
        </TabsTrigger>
        <TabsTrigger value="layers">
          <Layers3 className="size-3.5 mr-1" />
          Layers ({doc.layers.length})
        </TabsTrigger>
        <TabsTrigger value="env">Environment ({Object.keys(doc.config.env).length})</TabsTrigger>
        <TabsTrigger value="labels">Labels ({Object.keys(doc.config.labels).length})</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <dl>
          <Row label="Reference"><code className="font-mono text-xs">{doc.reference}</code></Row>
          <Row label="Digest"><code className="font-mono text-xs">{doc.digest}</code></Row>
          {doc.index_digest ? (
            <Row label="Index"><code className="font-mono text-xs">{doc.index_digest}</code></Row>
          ) : null}
          <Row label="Platforms">
            <span className="flex flex-wrap gap-1">
              {doc.platforms.length === 0 ? (
                <span className="text-muted-foreground">unknown</span>
              ) : (
                doc.platforms.map((p) => (
                  <Badge key={`${p.os}/${p.architecture}/${p.variant ?? ""}`} variant="outline">
                    {p.os}/{p.architecture}{p.variant ? `/${p.variant}` : ""}
                  </Badge>
                ))
              )}
            </span>
          </Row>
          <Row label="Compressed size">
            {formatBytes(doc.size_bytes)}{" "}
            <span className="text-muted-foreground">across {doc.layers.length} layer{doc.layers.length === 1 ? "" : "s"}</span>
          </Row>
          <Row label="User">{doc.config.user || <span className="text-muted-foreground">root (unset)</span>}</Row>
          <Row label="Working dir">{doc.config.working_dir || <span className="text-muted-foreground">/ (unset)</span>}</Row>
          <Row label="Entrypoint"><Argv argv={doc.config.entrypoint} /></Row>
          <Row label="Command"><Argv argv={doc.config.cmd} /></Row>
          <Row label="Exposed ports">
            {doc.config.exposed_ports.length === 0 ? (
              <span className="text-muted-foreground">none declared</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {doc.config.exposed_ports.map((p) => <Badge key={p} variant="secondary">{p}</Badge>)}
              </span>
            )}
          </Row>
          <Row label="Provenance">
            {doc.provenance ? (
              <span className="flex flex-wrap items-center gap-1">
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400">
                  attested
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {doc.provenance.builder_id ?? doc.provenance.build_type ?? doc.provenance.predicate_type ?? ""}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">none</span>
            )}
          </Row>
        </dl>
      </TabsContent>
      <TabsContent value="dockerfile"><DockerfileView doc={doc} /></TabsContent>
      <TabsContent value="layers">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Digest</TableHead>
                <TableHead>Media type</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="w-32">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.layers.map((layer, i) => (
                <TableRow key={`${layer.digest}-${i}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-mono text-xs" title={layer.digest}>{shortDigest(layer.digest)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{layer.media_type.replace("application/vnd.", "")}</TableCell>
                  <TableCell className="text-right">{formatBytes(layer.size_bytes)}</TableCell>
                  <TableCell>
                    <div className="h-2 w-full rounded bg-muted" aria-hidden>
                      <div className="h-2 rounded bg-primary/70" style={{ width: `${Math.min(100, (layer.size_bytes / total) * 100)}%` }} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
      <TabsContent value="env">
        <PairTable pairs={doc.config.env} keyHeader="Variable" empty="The image sets no environment variables." />
      </TabsContent>
      <TabsContent value="labels">
        <PairTable pairs={doc.config.labels} keyHeader="Label" empty="The image carries no labels." />
      </TabsContent>
    </Tabs>
  );
}

/** Fetches and renders the inspect document for one tag or digest. */
export function ImageInspectPanel({
  repoKey,
  image,
  reference,
}: {
  repoKey: string;
  image: string;
  reference: string;
}) {
  const query = useQuery({
    queryKey: ["image-inspect", repoKey, image, reference],
    queryFn: () => imageBuildsApi.inspect(repoKey, image, reference),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (query.isLoading) {
    return (
      <div className="space-y-2" data-testid="image-inspect-loading">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    const err = query.error;
    const status = err instanceof ApiError ? err.status : undefined;
    return (
      <p className="py-6 text-center text-sm text-muted-foreground" data-testid="image-inspect-error">
        {status === 404
          ? "This manifest is not in storage any more, or the backend predates image inspection."
          : `The image could not be inspected${err instanceof Error ? `: ${err.message}` : "."}`}
      </p>
    );
  }
  return <ImageInspectView doc={query.data} />;
}
