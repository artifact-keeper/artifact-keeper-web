/**
 * Repository formats whose ecosystem has a lockfile the backend can store as an
 * environment (`LockFormat` in the backend's environment_lock.rs: `pixi.lock`,
 * `conda-lock.yml`, `package-lock.json`, `Cargo.lock`, `poetry.lock`,
 * `uv.lock`). Formats with no supported lockfile (Maven, Gradle, container
 * images, Helm, Debian, RPM, NuGet, Go, generic, ...) get nothing from the
 * Environments tab, so it is hidden for them (#1037).
 *
 * `conda_native` is the conda alias, `poetry` the PyPI-family format whose
 * lockfile is `poetry.lock`, and `jupyter` a PyPI alias (artifact-keeper#3784).
 */
const LOCKFILE_FORMATS: ReadonlySet<string> = new Set([
  "conda",
  "conda_native",
  "npm",
  "cargo",
  "pypi",
  "poetry",
  "jupyter",
]);

export function formatHasLockfiles(format: string | null | undefined): boolean {
  return !!format && LOCKFILE_FORMATS.has(format);
}

/**
 * Whether to show a repository's Environments tab: its ecosystem has a
 * supported lockfile, or it already holds at least one registered environment
 * (so data registered under an unrelated repository stays reachable).
 */
export function showEnvironmentsTab(
  format: string | null | undefined,
  storedEnvironmentCount: number,
): boolean {
  return formatHasLockfiles(format) || storedEnvironmentCount > 0;
}
