"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hammer, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  imageBuildsApi,
  emptySpec,
  managersFor,
  parsePairs,
  specGroups,
  splitLines,
  suggestSystemManager,
} from "@/lib/api/image-builds";
import type { ImageBuildSettings, ImageBuildSpec, PackageGroup, PackageManager } from "@/types/image-builds";
import { SYSTEM_PACKAGE_MANAGERS } from "@/types/image-builds";
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

const ALL_MANAGERS: PackageManager[] = ["apt", "dnf", "microdnf", "yum", "apk", "pip", "conda"];

export const MANAGER_LABELS: Record<PackageManager, string> = {
  apt: "apt (Debian, Ubuntu, python:*)",
  dnf: "dnf (UBI, Fedora, RHEL)",
  microdnf: "microdnf (UBI minimal / micro)",
  yum: "yum (CentOS 7, Amazon Linux 2)",
  apk: "apk (Alpine)",
  pip: "pip (Python packages)",
  conda: "conda (Python / native packages)",
};

export interface GroupRow {
  manager: PackageManager;
  /** One package per line. */
  packages: string;
  /** Comma-separated conda channels. */
  channels: string;
}

export interface WizardForm {
  image: string;
  tag: string;
  mode: "spec" | "dockerfile";
  baseImage: string;
  groups: GroupRow[];
  multistage: boolean;
  dockerfile: string;
  env: string;
  labels: string;
  user: string;
  workdir: string;
  run: string;
}

const EMPTY: WizardForm = {
  image: "",
  tag: "",
  mode: "spec",
  baseImage: "",
  groups: [{ manager: "pip", packages: "", channels: "" }],
  multistage: true,
  dockerfile: "",
  env: "",
  labels: "",
  user: "",
  workdir: "",
  run: "",
};

/** What the wizard opens with: a previous build's spec, or the first allowed base. */
export function initialForm(spec: ImageBuildSpec | null, settings: ImageBuildSettings): WizardForm {
  if (!spec) return { ...EMPTY, baseImage: settings.base_allowlist[0] ?? "" };
  const groups = specGroups(spec).map((g) => ({
    manager: g.manager,
    packages: g.packages.join("\n"),
    channels: (g.channels ?? []).join(", "),
  }));
  return {
    ...EMPTY,
    mode: spec.dockerfile ? "dockerfile" : "spec",
    dockerfile: spec.dockerfile ?? "",
    baseImage: spec.base_image,
    groups: groups.length > 0 ? groups : EMPTY.groups,
    multistage: spec.multistage ?? false,
    env: Object.entries(spec.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"),
    labels: Object.entries(spec.labels ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"),
    user: spec.user ?? "",
    workdir: spec.workdir ?? "",
    run: (spec.run ?? []).join("\n"),
  };
}

/** Form fields → the spec the backend validates and renders. */
export function formToSpec(form: WizardForm): ImageBuildSpec {
  if (form.mode === "dockerfile") {
    return { ...emptySpec(""), dockerfile: form.dockerfile };
  }
  const groups: PackageGroup[] = form.groups
    .map((g) => ({
      manager: g.manager,
      packages: splitLines(g.packages),
      ...(g.manager === "conda"
        ? {
            channels: g.channels
              .split(/[,\s]+/)
              .map((c) => c.trim())
              .filter((c) => c !== ""),
          }
        : {}),
    }))
    .filter((g) => g.packages.length > 0);
  return {
    ...emptySpec(form.baseImage.trim()),
    packages: groups,
    multistage: form.multistage,
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

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * New image from a spec: the fields on the left, the Containerfile the
 * server would build on the right, refreshed as you type through the
 * render (dry-run) endpoint so its validation is the one you see. Package
 * groups pick their manager per distribution family; pip groups build in
 * a separate stage when "two-stage" is on; a Dockerfile mode replaces the
 * form when the instance allows it.
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
  const supported: PackageManager[] = settings.supported_package_managers?.length
    ? settings.supported_package_managers
    : ALL_MANAGERS;
  const [showAllManagers, setShowAllManagers] = useState(false);
  const debouncedBase = useDebounced(form.baseImage.trim(), 400);
  // What the registry knows about the base when it is stored here; the name
  // heuristic covers everything else.
  const baseInfo = useQuery({
    queryKey: ["image-build-base-info", repoKey, debouncedBase],
    queryFn: () => imageBuildsApi.baseInfo(repoKey, debouncedBase),
    enabled: open && form.mode === "spec" && debouncedBase !== "",
    retry: false,
    staleTime: 60_000,
  });
  const probe = baseInfo.data?.found ? baseInfo.data : null;
  const detected: PackageManager | null = probe?.system_manager ?? suggestSystemManager(form.baseImage);
  const detectedFrom = probe?.system_manager ? "the image's own build history" : detected ? "the image name" : null;
  const managers = showAllManagers ? supported : managersFor(supported, detected);

  const patch = (p: Partial<WizardForm>) => setForm((f) => ({ ...f, ...p }));
  const patchGroup = (i: number, p: Partial<GroupRow>) =>
    setForm((f) => ({ ...f, groups: f.groups.map((g, j) => (j === i ? { ...g, ...p } : g)) }));
  const addGroup = () => {
    const hasSystem = form.groups.some((g) => SYSTEM_PACKAGE_MANAGERS.has(g.manager));
    const suggested = hasSystem ? null : detected;
    const manager: PackageManager = suggested && managers.includes(suggested) ? suggested : "pip";
    patch({ groups: [...form.groups, { manager, packages: "", channels: "" }] });
  };
  const spec = useMemo(() => formToSpec(form), [form]);
  const debounced = useDebounced(spec, 350);
  const previewReady =
    open && (form.mode === "dockerfile" ? debounced.dockerfile?.trim() !== "" : debounced.base_image.trim() !== "");
  const preview = useQuery({
    queryKey: ["image-build-render", repoKey, debounced],
    queryFn: () => imageBuildsApi.render(repoKey, debounced),
    enabled: previewReady,
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
  const specComplete = form.mode === "dockerfile" ? form.dockerfile.trim() !== "" : spec.base_image !== "";
  const canSubmit =
    form.image.trim() !== "" &&
    form.tag.trim() !== "" &&
    specComplete &&
    !preview.isError &&
    !preview.isLoading &&
    !create.isPending;
  const systemNeedsUser = spec.packages.some((g) => SYSTEM_PACKAGE_MANAGERS.has(g.manager)) && form.user.trim() === "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(72rem,calc(100vw-2rem))] max-w-[calc(100%-2rem)] sm:max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="size-4" aria-hidden />
            New image
          </DialogTitle>
          <DialogDescription>
            Describe what goes on top of an approved base image. The server renders the
            Containerfile, BuildKit builds it and pushes the result into this repository with
            a provenance attestation that embeds the exact Containerfile.
          </DialogDescription>
        </DialogHeader>

        {settings.allow_dockerfile ? (
          <div role="radiogroup" aria-label="Build from" className="inline-flex rounded-md border p-0.5 text-sm">
            {(["spec", "dockerfile"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={form.mode === m}
                onClick={() => patch({ mode: m })}
                className={
                  form.mode === m
                    ? "rounded bg-primary px-3 py-1 text-primary-foreground"
                    : "rounded px-3 py-1 text-muted-foreground hover:text-foreground"
                }
              >
                {m === "spec" ? "Structured spec" : "Dockerfile"}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ib-image">Image name</Label>
                <Input id="ib-image" value={form.image} onChange={(e) => patch({ image: e.target.value })} placeholder="team/app" />
                <p className="text-xs text-muted-foreground">Path inside {repoKey}; lowercase segments.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ib-tag">Tag</Label>
                <Input id="ib-tag" value={form.tag} onChange={(e) => patch({ tag: e.target.value })} placeholder="1.0.0" />
              </div>
            </div>

            {form.mode === "dockerfile" ? (
              <div className="space-y-1">
                <Label htmlFor="ib-dockerfile">Dockerfile</Label>
                <Textarea
                  id="ib-dockerfile"
                  rows={18}
                  spellCheck={false}
                  className="font-mono text-xs"
                  value={form.dockerfile}
                  onChange={(e) => patch({ dockerfile: e.target.value })}
                  placeholder={"FROM python:3.12-slim AS build\nRUN pip install --no-cache-dir --target /opt/pkgs numpy==2.1.0\n\nFROM python:3.12-slim\nCOPY --from=build /opt/pkgs /opt/pkgs\nENV PYTHONPATH=/opt/pkgs"}
                />
                <p className="text-xs text-muted-foreground">
                  Every FROM must be under an allowed base
                  {settings.base_allowlist.length ? ` (${settings.base_allowlist.join(", ")})` : ""}. The server appends the spec
                  label; nothing else is checked, so the scan gate is your review.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="ib-base">Base image</Label>
                  <Input id="ib-base" className="font-mono text-xs" value={form.baseImage} onChange={(e) => patch({ baseImage: e.target.value })} placeholder="python:3.12-slim" />
                  <p className="text-xs text-muted-foreground">
                    {settings.base_allowlist.length > 0
                      ? `Allowed prefixes: ${settings.base_allowlist.join(", ")}`
                      : "Any base image; pin a tag so the build is reproducible."}
                  </p>
                  {detected ? (
                    <p className="text-xs" data-testid="base-detected">
                      <Badge variant="secondary" className="mr-1 font-mono">{detected}</Badge>
                      system packages, from {detectedFrom}
                      {probe?.architecture ? ` · ${probe.os}/${probe.architecture}` : ""}
                      {probe?.user ? ` · runs as ${probe.user}` : ""}
                      {probe && !probe.has_pip ? " · no pip in the image" : ""}
                      {probe?.has_conda ? " · conda present" : ""}
                      {" "}
                      <button type="button" className="underline text-muted-foreground" onClick={() => setShowAllManagers((v) => !v)}>
                        {showAllManagers ? "only matching managers" : "show all managers"}
                      </button>
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Packages</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addGroup}>
                      <Plus className="size-3.5 mr-1" aria-hidden />
                      Add package group
                    </Button>
                  </div>
                  {form.groups.map((g, i) => (
                    <div key={i} className="space-y-2 rounded-md border p-3" data-testid={`package-group-${i}`}>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Package manager ${i + 1}`}
                          value={g.manager}
                          onChange={(e) => patchGroup(i, { manager: e.target.value as PackageManager })}
                          className={SELECT_CLASS}
                        >
                          {(managers.includes(g.manager) ? managers : [g.manager, ...managers]).map((m) => (
                            <option key={m} value={m}>
                              {MANAGER_LABELS[m] ?? m}
                            </option>
                          ))}
                        </select>
                        <Button type="button" size="sm" variant="ghost" onClick={() => patch({ groups: form.groups.filter((_, j) => j !== i) })} title="Remove group">
                          <Trash2 className="size-4" aria-hidden />
                          <span className="sr-only">Remove group {i + 1}</span>
                        </Button>
                      </div>
                      <Textarea
                        aria-label={`Packages ${i + 1}`}
                        rows={3}
                        spellCheck={false}
                        className="font-mono text-xs"
                        value={g.packages}
                        onChange={(e) => patchGroup(i, { packages: e.target.value })}
                        placeholder={
                          g.manager === "pip"
                            ? "numpy==2.1.0\npandas==2.2.3"
                            : g.manager === "conda"
                              ? "samtools=1.20"
                              : "libgomp1\ngit"
                        }
                      />
                      {g.manager === "conda" ? (
                        <Input
                          aria-label={`Conda channels ${i + 1}`}
                          className="font-mono text-xs"
                          value={g.channels}
                          onChange={(e) => patchGroup(i, { channels: e.target.value })}
                          placeholder="conda-forge, bioconda"
                        />
                      ) : null}
                      {SYSTEM_PACKAGE_MANAGERS.has(g.manager) ? (
                        <p className="text-xs text-muted-foreground">Installs as root in the final stage; set the user below.</p>
                      ) : null}
                    </div>
                  ))}
                  {form.groups.length > 1 ? (
                    <Button type="button" size="sm" variant="ghost" className="w-full" onClick={addGroup}>
                      <Plus className="size-3.5 mr-1" aria-hidden />
                      Add another package group
                    </Button>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.multistage}
                      onChange={(e) => patch({ multistage: e.target.checked })}
                      aria-label="Two-stage build"
                    />
                    Two-stage build: install pip packages in a builder stage and copy only the result
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="ib-user">User</Label>
                    <Input id="ib-user" value={form.user} onChange={(e) => patch({ user: e.target.value })} placeholder={probe?.user ?? "app"} />
                    {systemNeedsUser ? (
                      <p className="text-xs text-amber-700 dark:text-amber-400">System packages need the user the image runs as afterwards.</p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ib-workdir">Working dir</Label>
                    <Input id="ib-workdir" value={form.workdir} onChange={(e) => patch({ workdir: e.target.value })} placeholder="/app" />
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
              </>
            )}
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
              {preview.data?.containerfile ??
                (specComplete ? "" : form.mode === "dockerfile" ? "# Paste a Dockerfile to check it." : "# Choose a base image to see the Containerfile.")}
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
              Pushes to{" "}
              <Badge variant="outline" className="font-mono">
                {settings.push_registry ?? "?"}/{repoKey}/{form.image.trim() || "<image>"}:{form.tag.trim() || "<tag>"}
              </Badge>{" "}
              with a SLSA provenance attestation. Timeout {Math.round(settings.timeout_secs / 60)} min.
              {settings.pip_index_url ? ` pip installs use ${settings.pip_index_url}.` : ""}
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
