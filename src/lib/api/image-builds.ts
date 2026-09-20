import { apiFetch } from "@/lib/api/fetch";
import type {
  BaseImageInfo,
  ImageBuild,
  ImageBuildSettings,
  ImageBuildSpec,
  ImageInspect,
  PackageGroup,
  PackageManager,
  RenderImageBuildResponse,
} from "@/types/image-builds";

export type {
  ImageBuild,
  ImageBuildSettings,
  ImageBuildSpec,
  ImageBuildStatus,
  ImageInspect,
  BaseImageInfo,
  PackageGroup,
  PackageManager,
  RenderImageBuildResponse,
} from "@/types/image-builds";
import { SYSTEM_PACKAGE_MANAGERS } from "@/types/image-builds";

/**
 * Image builder + inspector for container repositories. Not in the
 * generated SDK yet, so these go through `apiFetch` (same base URL, CSRF
 * header and error envelope as every other hand-written module).
 */
export const imageBuildsApi = {
  inspect: (repoKey: string, image: string, reference: string) =>
    apiFetch<ImageInspect>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/image-inspect?image=${encodeURIComponent(image)}&reference=${encodeURIComponent(reference)}`,
    ),
  settings: (repoKey: string) =>
    apiFetch<ImageBuildSettings>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/image-builds/settings`,
    ),
  /** What this registry knows about a base image (distro family, user, pip/conda). */
  baseInfo: (repoKey: string, image: string) =>
    apiFetch<BaseImageInfo>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/image-builds/base-info?image=${encodeURIComponent(image)}`,
    ),
  render: (repoKey: string, spec: ImageBuildSpec) =>
    apiFetch<RenderImageBuildResponse>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/image-builds/render`,
      { method: "POST", body: JSON.stringify({ spec }) },
    ),
  list: (repoKey: string) =>
    apiFetch<{ items: ImageBuild[]; total: number }>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/image-builds`,
    ),
  get: (repoKey: string, id: string) =>
    apiFetch<ImageBuild>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/image-builds/${encodeURIComponent(id)}`,
    ),
  create: (repoKey: string, body: { image: string; tag: string; spec: ImageBuildSpec }) =>
    apiFetch<ImageBuild>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/image-builds`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  /** The buildctl output so far, as text (the endpoint is text/plain). */
  log: async (repoKey: string, id: string): Promise<string> => {
    const { getActiveInstanceBaseUrl } = await import("@/lib/sdk-client");
    const res = await fetch(
      `${getActiveInstanceBaseUrl()}/api/v1/repositories/${encodeURIComponent(repoKey)}/image-builds/${encodeURIComponent(id)}/log`,
      { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } },
    );
    if (!res.ok) throw new Error(`log ${res.status}`);
    return res.text();
  },
};

/** Pure helpers shared by the wizard and the inspect view. */

/** `sha256:0123456789ab…` for tables. */
export function shortDigest(digest: string | null | undefined, head = 12): string {
  if (!digest) return "";
  const prefix = "sha256:";
  return digest.startsWith(prefix)
    ? `${prefix}${digest.slice(prefix.length, prefix.length + head)}`
    : digest.slice(0, head);
}

const INSTRUCTIONS = new Set([
  "FROM", "RUN", "CMD", "LABEL", "EXPOSE", "ENV", "ADD", "COPY", "ENTRYPOINT",
  "VOLUME", "USER", "WORKDIR", "ARG", "ONBUILD", "STOPSIGNAL", "HEALTHCHECK", "SHELL",
]);

export interface DockerfileLine {
  instruction: string;
  text: string;
  emptyLayer: boolean;
  sizeBytes: number | null;
  layerDigest: string | null;
}

/**
 * Normalize a `history[].created_by` into a Dockerfile line: the classic
 * builder's `/bin/sh -c #(nop)  ENV A=1` becomes `ENV A=1`, its
 * `/bin/sh -c cmd` becomes `RUN cmd`, BuildKit's trailing `# buildkit` is
 * dropped.
 */
export function dockerfileLine(createdBy: string): { instruction: string; text: string } {
  let text = createdBy.trim().replace(/\s*#\s*buildkit\s*$/, "");
  const nop = text.match(/^\/bin\/sh -c #\(nop\)\s*([\s\S]*)$/);
  if (nop) text = nop[1].trim();
  else if (text.startsWith("/bin/sh -c ")) text = `RUN ${text.slice("/bin/sh -c ".length).trim()}`;
  // BuildKit records a shell-form RUN as `RUN /bin/sh -c cmd`; the shell is
  // implied in a Dockerfile, so drop it from the reconstruction.
  text = text.replace(/^RUN \/bin\/sh -c /, "RUN ");
  const first = (text.split(/\s+/, 1)[0] ?? "").toUpperCase();
  if (INSTRUCTIONS.has(first)) return { instruction: first, text: `${first}${text.slice(first.length)}` };
  return { instruction: "RUN", text: text === "" ? "RUN" : `RUN ${text}` };
}

export function dockerfileLines(history: ImageInspect["history"]): DockerfileLine[] {
  return history.map((h) => ({
    ...dockerfileLine(h.created_by),
    emptyLayer: h.empty_layer,
    sizeBytes: h.empty_layer ? null : (h.size_bytes ?? null),
    layerDigest: h.empty_layer ? null : (h.layer_digest ?? null),
  }));
}

export function emptySpec(baseImage = ""): ImageBuildSpec {
  return {
    base_image: baseImage,
    packages: [],
    multistage: false,
    env: {},
    labels: {},
    user: null,
    workdir: null,
    run: [],
  };
}

/** Legacy shorthand fields (apt/conda/pip) folded into groups, oldest first, then explicit groups. */
export function specGroups(spec: ImageBuildSpec): PackageGroup[] {
  const groups: PackageGroup[] = [];
  if (spec.apt?.length) groups.push({ manager: "apt", packages: spec.apt });
  if (spec.conda?.length) groups.push({ manager: "conda", packages: spec.conda, channels: spec.conda_channels ?? [] });
  if (spec.pip?.length) groups.push({ manager: "pip", packages: spec.pip });
  return [...groups, ...(spec.packages ?? [])];
}

/**
 * The system package manager a base image most likely carries, from its
 * name: UBI and other RPM families → microdnf/dnf, Alpine → apk, Debian,
 * Ubuntu and the official Python images → apt. Null when unsure.
 */
/**
 * The managers worth offering for a base whose system manager is known:
 * that manager plus pip and conda. Unknown → everything the instance
 * supports.
 */
export function managersFor(
  supported: PackageManager[],
  systemManager: PackageManager | null | undefined,
): PackageManager[] {
  if (!systemManager || !supported.includes(systemManager)) return supported;
  return supported.filter((m) => m === systemManager || !SYSTEM_PACKAGE_MANAGERS.has(m));
}

export function suggestSystemManager(baseImage: string): PackageManager | null {
  const b = baseImage.toLowerCase();
  if (b.includes("alpine")) return "apk";
  if (b.includes("ubi-micro") || b.includes("ubi9-micro") || b.includes("ubi8-micro")) return "microdnf";
  if (b.includes("ubi-minimal") || b.includes("-minimal")) return "microdnf";
  if (b.includes("ubi") || b.includes("fedora") || b.includes("rockylinux") || b.includes("almalinux") || b.includes("rhel")) return "dnf";
  if (b.includes("centos:7") || b.includes("amazonlinux:2")) return "yum";
  if (b.includes("debian") || b.includes("ubuntu") || b.startsWith("python") || b.includes("/python")) return "apt";
  return null;
}

/** One entry per non-empty, non-comment line. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/** `KEY=value` lines → map; lines without `=` are dropped. */
export function parsePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of splitLines(text)) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1);
  }
  return out;
}

export function pairsToText(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/** Whether an in-flight build should keep being polled. */
export function isActiveBuild(status: string): boolean {
  return status === "queued" || status === "running";
}
