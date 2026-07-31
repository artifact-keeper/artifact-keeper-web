import type { RepositoryFormat } from "@/types";

/**
 * Repository-detail primary tabs whose default selection is format-driven
 * (issue #2793). Other tabs (upload, members, security, settings, …) are never
 * the default and are not modelled here.
 */
export type RepoDetailTab = "artifacts" | "packages";

/**
 * Formats that expose a first-class **package catalog** — a name/version
 * grouping the backend surfaces via `GET /api/v1/packages` (Maven
 * `groupId:artifactId`, npm package name, PyPI project, an OS package, …). For
 * these, the Packages view is the primary way a user browses the repository, so
 * the repository-detail page defaults to the Packages tab.
 *
 * Deliberately conservative: RAW/Generic and container/OCI image formats
 * (`generic`, `docker`, `podman`, `buildx`, `oras`, `wasm_oci`, `incus`,
 * `lxc`), blob stores (`gitlfs`), and formats whose "package" semantics are
 * fuzzier (`terraform`, `opentofu`, `vagrant`, `bazel`, `protobuf`, `p2`,
 * `huggingface`, `mlmodel`, `vscode`, `jetbrains`) are intentionally **not**
 * included and keep the Artifacts tab as their default. Extend this set as more
 * formats grow a stable package catalog.
 */
const PACKAGE_ORIENTED_FORMATS = new Set<RepositoryFormat>([
  // JVM
  "maven",
  "gradle",
  "sbt",
  // JavaScript
  "npm",
  "yarn",
  "pnpm",
  "bower",
  // Python
  "pypi",
  "poetry",
  // Rust / Go / Ruby / PHP
  "cargo",
  "go",
  "rubygems",
  "composer",
  // .NET / Windows
  "nuget",
  "chocolatey",
  "powershell",
  // Conda / Elixir / Dart / R / Swift-ecosystem
  "conda",
  "conda_native",
  "hex",
  "pub",
  "cran",
  "cocoapods",
  "swift",
  // Charts & OS packages
  "helm",
  "helm_oci",
  "rpm",
  "debian",
  "alpine",
  "opkg",
  // Config-management modules
  "puppet",
  "chef",
  "ansible",
]);

export function isPackageOrientedFormat(format: RepositoryFormat): boolean {
  return PACKAGE_ORIENTED_FORMATS.has(format);
}

/**
 * The per-format default primary tab: Packages for formats with a package
 * catalog, Artifacts for everything else (RAW/Generic, containers, unknown).
 */
export function defaultRepoTab(
  format: RepositoryFormat | undefined,
): RepoDetailTab {
  return format && isPackageOrientedFormat(format) ? "packages" : "artifacts";
}

const VALID_TABS = new Set<RepoDetailTab>(["artifacts", "packages"]);

function isValidTab(value: string | null | undefined): value is RepoDetailTab {
  return !!value && VALID_TABS.has(value as RepoDetailTab);
}

/**
 * Resolve the initial primary tab for the repository-detail page.
 *
 * Precedence:
 *  1. An explicit, valid `?tab=` deep-link always wins (shareable override).
 *  2. A `?view=` param is an Artifacts-browser concept (flat/grouped/tree), so
 *     its presence pins the Artifacts tab — this keeps existing artifact
 *     deep-links landing on the artifact browser even for package formats.
 *  3. Otherwise fall back to the per-format default.
 *
 * Used only to seed the Tabs `defaultValue` (uncontrolled), so it sets the
 * initial tab without hijacking later user clicks.
 */
export function resolveInitialRepoTab(
  urlTab: string | null | undefined,
  urlView: string | null | undefined,
  format: RepositoryFormat | undefined,
): RepoDetailTab {
  if (isValidTab(urlTab)) return urlTab;
  if (urlView != null && urlView !== "") return "artifacts";
  return defaultRepoTab(format);
}
