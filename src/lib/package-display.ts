import { formatNumber } from "./utils";

/**
 * Formats whose "version" is a revision, tag or free-form label rather than a
 * semantic version: a Hugging Face revision (`main`, a branch, a commit), an
 * OCI/Docker tag (`latest`, `bookworm-slim`), a model-registry or LFS label,
 * or whatever a generic upload was given. Prefixing these with `v` produces
 * `vmain` / `vlatest` (#1085), so they are shown exactly as stored.
 */
const VERBATIM_VERSION_FORMATS: ReadonlySet<string> = new Set([
  "huggingface",
  "mlmodel",
  "gitlfs",
  "generic",
  "docker",
  "podman",
  "buildx",
  "oras",
  "wasm_oci",
  "helm_oci",
  "incus",
  "lxc",
]);

/**
 * The version as a package page shows it.
 *
 * Semver-ish versions keep the existing `v` prefix (`1.2.3` -> `v1.2.3`).
 * Formats whose versions are revisions or tags are shown verbatim, and so is
 * any version that is not numeric (`main`, `latest`) or already carries its
 * own `v` (Go's `v1.2.3` must not become `vv1.2.3`). Empty input gives "".
 */
export function formatVersionLabel(
  version: string | null | undefined,
  format: string | null | undefined,
): string {
  if (!version) return "";
  if (format && VERBATIM_VERSION_FORMATS.has(format.toLowerCase())) {
    return version;
  }
  if (/^\d/.test(version)) return `v${version}`;
  return version;
}

/**
 * The download count for a package or package version as the UI should show
 * it, or null when there is no observed count to show.
 *
 * The backend's `/api/v1/packages` `download_count` (and the per-version one)
 * is read straight from `packages.download_count` /
 * `package_versions.download_count`, columns that default to 0 and that no
 * download path increments: downloads are recorded per artifact in
 * `download_statistics` instead. A 0 there is therefore the column default,
 * not "nobody downloaded this", and showing it reads as a wrong count
 * (`0 downloads` on a model that was just pulled, #1085). Absent, null, zero,
 * negative or non-finite values are all "not tracked" and hidden; a positive
 * count is shown as reported.
 */
export function formatPackageDownloads(
  count: number | null | undefined,
): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
    return null;
  }
  return formatNumber(count);
}
