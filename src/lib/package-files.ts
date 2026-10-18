/**
 * Where a package's files live in its repository's tree (#987).
 *
 * The package Files tab browses `GET /api/v1/tree?path=<prefix>`, which lists
 * artifacts whose storage path starts with `<prefix>/` (repository-relative,
 * no leading slash). The catalog package name is not always that prefix: a
 * Maven package is named `groupId:artifactId` but stored under
 * `group/as/dirs/artifactId/...`, a NuGet id keeps its casing while the path
 * is lowercased, and so on. The mapping below follows how each backend
 * handler names a package and lays out its files for a hosted upload.
 */

const OCI_FORMATS = new Set([
  "docker",
  "podman",
  "buildx",
  "oras",
  "wasm_oci",
  "helm_oci",
]);

/**
 * Formats whose files are not grouped under a per-package directory
 * (`packages/<file>.rpm`, `pool/<component>/...`, `<subdir>/<file>.conda`,
 * `<branch>/<repo>/<arch>/<file>.apk`, `<arch>/<file>.pkg.tar.zst`), so no
 * tree prefix selects one package's files.
 */
const FLAT_LAYOUT_FORMATS = new Set([
  "rpm",
  "debian",
  "conda",
  "conda_native",
  "alpine",
  "pacman",
]);

/** Go module proxy case encoding: each uppercase letter becomes `!` + lowercase. */
export function encodeGoModulePath(modulePath: string): string {
  return modulePath.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`);
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

/**
 * The repository-relative tree prefix holding a package's files, or `null`
 * when the format keeps files in a flat layout with no per-package directory.
 * Formats not listed use the package name as is (npm `@scope/name`, PyPI's
 * normalized name, Cargo, Helm, RubyGems, Composer `vendor/pkg`, generic...).
 */
export function packageFilesRootPath(
  format: string | undefined,
  name: string,
): string | null {
  const fmt = (format ?? "").toLowerCase();
  const pkg = trimSlashes(name.trim());
  if (!pkg) return null;

  if (FLAT_LAYOUT_FORMATS.has(fmt)) return null;
  if (OCI_FORMATS.has(fmt)) return `v2/${pkg}`;

  switch (fmt) {
    case "maven":
    case "gradle": {
      // `groupId:artifactId` -> `group/id/as/dirs/artifactId`.
      const colon = pkg.indexOf(":");
      if (colon <= 0) return pkg;
      const groupId = pkg.slice(0, colon);
      const artifactId = pkg.slice(colon + 1).split(":")[0];
      return `${groupId.replace(/\./g, "/")}/${artifactId}`;
    }
    case "nuget":
    case "chocolatey":
    case "powershell":
      // The catalog keeps the nuspec id's casing; paths use the lowercased id.
      return pkg.toLowerCase();
    case "go":
      return encodeGoModulePath(pkg);
    case "swift":
    case "vscode":
      // `scope.name` / `publisher.name` are stored as `scope/name/...`.
      return pkg.replace(".", "/");
    case "bazel":
    case "protobuf":
      return `modules/${pkg}`;
    case "conan": {
      // `name@user/channel` is stored as `name/<version>/user/channel/...`;
      // the bare name is the closest single prefix.
      const at = pkg.indexOf("@");
      return at > 0 ? pkg.slice(0, at) : pkg;
    }
    default:
      return pkg;
  }
}

/**
 * Tree nodes come back with the repository key prepended
 * (`maven-releases/com/example`), while the tree endpoint's `path` and the
 * content endpoints take repository-relative paths.
 */
export function repositoryRelativeTreePath(
  repositoryKey: string,
  nodePath: string,
): string {
  if (nodePath === repositoryKey) return "";
  const prefix = `${repositoryKey}/`;
  return nodePath.startsWith(prefix) ? nodePath.slice(prefix.length) : nodePath;
}
