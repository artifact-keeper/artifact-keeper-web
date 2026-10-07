/**
 * Conda package helpers for the repository browser and artifact detail view.
 *
 * A conda package is stored at `<subdir>/<filename>` (backend
 * `build_conda_artifact_path`), where the filename is
 * `<name>-<version>-<build>.conda` or `.tar.bz2`. The backend also records the
 * package's `index.json` fields (subdir, build, license, depends, ...) in the
 * artifact metadata; those win when present, and the path is the fallback for
 * listings that carry no metadata.
 */

export function isCondaFormat(format: string | null | undefined): boolean {
  return format === "conda" || format === "conda_native";
}

export interface CondaPackageFields {
  subdir?: string;
  name?: string;
  version?: string;
  build?: string;
  buildNumber?: number;
  license?: string;
  depends: string[];
}

const PACKAGE_SUFFIXES = [".conda", ".tar.bz2"];

/** Split `<name>-<version>-<build>.<ext>` into its parts; undefined when it does not fit. */
export function parseCondaFilename(
  filename: string,
): { name: string; version: string; build: string } | undefined {
  const suffix = PACKAGE_SUFFIXES.find((s) => filename.endsWith(s));
  if (!suffix) return undefined;
  const stem = filename.slice(0, -suffix.length);
  const buildAt = stem.lastIndexOf("-");
  if (buildAt <= 0) return undefined;
  const versionAt = stem.lastIndexOf("-", buildAt - 1);
  if (versionAt <= 0) return undefined;
  return {
    name: stem.slice(0, versionAt),
    version: stem.slice(versionAt + 1, buildAt),
    build: stem.slice(buildAt + 1),
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

export function condaPackageFields(
  path: string,
  metadata?: Record<string, unknown> | null,
): CondaPackageFields {
  const segments = path.split("/").filter(Boolean);
  const filename = segments[segments.length - 1] ?? "";
  const pathSubdir = segments.length > 1 ? segments[segments.length - 2] : undefined;
  const parsed = parseCondaFilename(filename);
  const m = metadata ?? {};
  const depends = Array.isArray(m.depends)
    ? m.depends.filter((d): d is string => typeof d === "string")
    : [];
  return {
    subdir: str(m.subdir) ?? pathSubdir,
    name: str(m.name) ?? parsed?.name,
    version: str(m.version) ?? parsed?.version,
    build: str(m.build) ?? parsed?.build,
    buildNumber: typeof m.build_number === "number" ? m.build_number : undefined,
    license: str(m.license),
    depends,
  };
}
