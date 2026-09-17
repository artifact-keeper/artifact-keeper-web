"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hammer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { imageBuildsApi, emptySpec, parsePairs, splitLines } from "@/lib/api/image-builds";
import type { ImageBuildSettings, ImageBuildSpec } from "@/types/image-builds";
import { ApiError } from "@/lib/api/fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface WizardForm {
  image: string;
  tag: string;
  baseImage: string;
  pip: string;
  conda: string;
  condaChannels: string;
  apt: string;
  env: string;
  labels: string;
  user: string;
  workdir: string;
  run: string;
}

const EMPTY: WizardForm = {
  image: "",
  tag: "",
  baseImage: "",
  pip: "",
  conda: "",
  condaChannels: "",
  apt: "",
  env: "",
  labels: "",
  user: "",
  workdir: "",
  run: "",
};

/** What the wizard opens with: a previous build's spec, or the first allowed base. */
export function initialForm(spec: ImageBuildSpec | null, settings: ImageBuildSettings): WizardForm {
  if (!spec) return { ...EMPTY, baseImage: settings.base_allowlist[0] ?? "" };
  return {
    ...EMPTY,
    baseImage: spec.base_image,
    pip: spec.pip.join("\n"),
    conda: spec.conda.join("\n"),
    condaChannels: spec.conda_channels.join(", "),
    apt: spec.apt.join("\n"),
    env: Object.entries(spec.env).map(([k, v]) => `${k}=${v}`).join("\n"),
    labels: Object.entries(spec.labels).map(([k, v]) => `${k}=${v}`).join("\n"),
    user: spec.user ?? "",
    workdir: spec.workdir ?? "",
    run: spec.run.join("\n"),
  };
}

/** Form fields → the spec the backend validates and renders. */
export function formToSpec(form: WizardForm): ImageBuildSpec {
  return {
    ...emptySpec(form.baseImage.trim()),
    pip: splitLines(form.pip),
    conda: splitLines(form.conda),
    conda_channels: form.condaChannels
      .split(/[,\s]+/)
      .map((c) => c.trim())
      .filter((c) => c !== ""),
    apt: splitLines(form.apt),
    env: parsePairs(form.env),
    labels: parsePairs(form.labels),
    user: form.user.trim() === "" ? null : form.user.trim(),
    workdir: form.workdir.trim() === "" ? null : form.workdir.trim(),
    run: splitLines(form.run),
  };
}

/** The message a 400 from the backend carries, or the raw body. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.body) as { message?: string };
      if (body.message) return body.message;
    } catch {
      /* not JSON */
    }
    return err.body || `HTTP ${err.status}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * New image from a spec: the fields on the left, the Containerfile the
 * server would build on the right, refreshed as you type through the
 * render (dry-run) endpoint so its validation is the one you see.
 */
export function ImageBuildWizard({
  repoKey,
  settings,
  open,
  onOpenChange,
  initialSpec,
}: {
  repoKey: string;
  settings: ImageBuildSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill from an existing build's spec ("rebuild with changes"). */
  initialSpec?: ImageBuildSpec | null;
}) {
  const queryClient = useQueryClient();
  // The initial form is derived once per mount; the parent remounts the
  // wizard (a fresh `key`) each time it opens, so no effect is needed.
  const [form, setForm] = useState<WizardForm>(() => initialForm(initialSpec ?? null, settings));

  const patch = (p: Partial<WizardForm>) => setForm((f) => ({ ...f, ...p }));
  const spec = useMemo(() => formToSpec(form), [form]);
  const debounced = useDebounced(spec, 350);
  const preview = useQuery({
    queryKey: ["image-build-render", repoKey, debounced],
    queryFn: () => imageBuildsApi.render(repoKey, debounced),
    enabled: open && debounced.base_image.trim() !== "",
    retry: false,
  });

  const create = useMutation({
    mutationFn: () => imageBuildsApi.create(repoKey, { image: form.image.trim(), tag: form.tag.trim(), spec }),
    onSuccess: (build) => {
      toast.success(`Build queued: ${build.reference}`);
      queryClient.invalidateQueries({ queryKey: ["image-builds", repoKey] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const previewError = preview.isError ? errorMessage(preview.error) : null;
  const canSubmit =
    form.image.trim() !== "" &&
    form.tag.trim() !== "" &&
    spec.base_image !== "" &&
    !preview.isError &&
    !preview.isLoading &&
    !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(72rem,calc(100vw-2rem))] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="size-4" aria-hidden />
            New image
          </DialogTitle>
          <DialogDescription>
            Describe what goes on top of an approved base image. The server renders the
            Containerfile, BuildKit builds it and pushes the result into this repository with
            a provenance attestation that embeds the exact Containerfile. No Dockerfile is
            written by hand.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ib-image">Image name</Label>
                <Input id="ib-image" value={form.image} onChange={(e) => patch({ image: e.target.value })} placeholder="team/ray" />
                <p className="text-xs text-muted-foreground">Path inside {repoKey}; lowercase segments.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ib-tag">Tag</Label>
                <Input id="ib-tag" value={form.tag} onChange={(e) => patch({ tag: e.target.value })} placeholder="2.56.0-genomics" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ib-base">Base image</Label>
              <Input id="ib-base" className="font-mono text-xs" value={form.baseImage} onChange={(e) => patch({ baseImage: e.target.value })} placeholder="rayproject/ray:2.56.0" />
              <p className="text-xs text-muted-foreground">
                {settings.base_allowlist.length > 0
                  ? `Allowed prefixes: ${settings.base_allowlist.join(", ")}`
                  : "Any base image; pin a tag so the build is reproducible."}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ib-pip">pip packages (one per line)</Label>
              <Textarea id="ib-pip" rows={4} spellCheck={false} className="font-mono text-xs" value={form.pip} onChange={(e) => patch({ pip: e.target.value })} placeholder={"scanpy==1.10.2\npolars==1.9.0"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ib-conda">conda packages</Label>
                <Textarea id="ib-conda" rows={3} spellCheck={false} className="font-mono text-xs" value={form.conda} onChange={(e) => patch({ conda: e.target.value })} placeholder={"samtools=1.20"} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ib-channels">conda channels</Label>
                <Input id="ib-channels" className="font-mono text-xs" value={form.condaChannels} onChange={(e) => patch({ condaChannels: e.target.value })} placeholder="conda-forge, bioconda" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ib-apt">apt packages</Label>
                <Textarea id="ib-apt" rows={3} spellCheck={false} className="font-mono text-xs" value={form.apt} onChange={(e) => patch({ apt: e.target.value })} placeholder={"libgomp1"} />
                <p className="text-xs text-muted-foreground">Installs as root; set the user below.</p>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="ib-user">User</Label>
                  <Input id="ib-user" value={form.user} onChange={(e) => patch({ user: e.target.value })} placeholder="ray" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ib-workdir">Working dir</Label>
                  <Input id="ib-workdir" value={form.workdir} onChange={(e) => patch({ workdir: e.target.value })} placeholder="/home/ray" />
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ib-env">Environment (KEY=value per line)</Label>
                <Textarea id="ib-env" rows={3} spellCheck={false} className="font-mono text-xs" value={form.env} onChange={(e) => patch({ env: e.target.value })} placeholder={"OMP_NUM_THREADS=1"} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ib-labels">Labels (key=value per line)</Label>
                <Textarea id="ib-labels" rows={3} spellCheck={false} className="font-mono text-xs" value={form.labels} onChange={(e) => patch({ labels: e.target.value })} placeholder={"org.opencontainers.image.source=https://…"} />
              </div>
            </div>
            {settings.allow_run ? (
              <div className="space-y-1">
                <Label htmlFor="ib-run">Raw RUN lines (administrator-enabled)</Label>
                <Textarea id="ib-run" rows={3} spellCheck={false} className="font-mono text-xs" value={form.run} onChange={(e) => patch({ run: e.target.value })} />
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Containerfile the server will build</Label>
              {preview.isFetching ? <span className="text-xs text-muted-foreground">rendering…</span> : null}
            </div>
            {previewError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" data-testid="render-error">
                {previewError}
              </div>
            ) : null}
            <pre className="min-h-64 overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre" data-testid="containerfile-preview">
              {preview.data?.containerfile ?? (spec.base_image === "" ? "# Choose a base image to see the Containerfile." : "")}
            </pre>
            {preview.data?.warnings.length ? (
              <ul className="space-y-1">
                {preview.data.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Pushes to <Badge variant="outline" className="font-mono">{settings.push_registry ?? "?"}/{repoKey}/{form.image.trim() || "<image>"}:{form.tag.trim() || "<tag>"}</Badge>
              {" "}with a SLSA provenance attestation. Timeout {Math.round(settings.timeout_secs / 60)} min.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit}>
            <Hammer className="size-4 mr-1" aria-hidden />
            {create.isPending ? "Queuing…" : "Build image"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
