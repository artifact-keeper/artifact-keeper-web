import type { RepositoryFormat } from "@/types";

// ---------------------------------------------------------------------------
// Scan-on-proxy format coverage (backend artifact-keeper#1274)
//
// Shared logic, so it lives in `src/lib` next to the sibling per-format
// capability predicates (`supportsPackageAnalysis`, `supportsVersioning`)
// rather than in the repositories route's `_lib/constants.ts`: both the
// repository settings forms and `@/lib/proxy-scan` gate on it, and `src/lib`
// must not import from `src/app`.
//
// `scan_configs.scan_on_proxy` is accepted for a repository of any format, but
// backend 1.10.0 only *enforces* the inline scan-and-block gate in four request
// handlers. A proxying repository of any other format serves upstream content
// unscanned while the toggle reads as on, so the UI must not offer it there.
//
// Derived from the backend 1.10.0 tree, not from the issue text:
//   * `backend/src/api/routes.rs` - which URL prefix nests which handler.
//   * `git grep -E 'serve_scanned_|is_proxy_scan_enabled' -- backend/src/api/handlers`
//     - only `npm.rs`, `pypi.rs`, `oci_v2.rs` and `vscode.rs` consult the flag.
//   * `RepositoryFormat::handler_key` + `formats::get_handler_for_format` in
//     `backend/src/models/repository.rs` / `backend/src/formats/mod.rs` - which
//     alias formats collapse onto which handler.
// ---------------------------------------------------------------------------

export const SCAN_ON_PROXY_GATED_FORMATS: ReadonlySet<RepositoryFormat> = new Set([
  // npm family, served at `/npm` by `api/handlers/npm.rs` (`serve_scanned_npm_tarball`).
  "npm",
  "yarn",
  "pnpm",
  "bower",
  // PyPI family, served at `/pypi` by `api/handlers/pypi.rs` (`serve_scanned_pypi_file`).
  // `conda` is deliberately absent: it shares the PyPI *FormatHandler* but has
  // its own ungated `/conda` router (`api/handlers/conda.rs`).
  "pypi",
  "poetry",
  "jupyter",
  // OCI family, served at `/v2` by `api/handlers/oci_v2.rs` (manifest + blob re-block).
  "docker",
  "podman",
  "buildx",
  "oras",
  "wasm_oci",
  "helm_oci",
  // VS Code gallery, served at `/vscode` by `api/handlers/vscode.rs`
  // (`serve_scanned_gallery_package`, new in backend 1.10.0).
  "vscode",
]);

/**
 * Whether the backend actually enforces `scan_on_proxy` for this format.
 *
 * `false` means the flag is stored and echoed back but proxied content is
 * served without a scan verdict, so the toggle must not be presented as an
 * enableable control and no proxy-scan verdict view can have anything to show.
 *
 * Accepts a loose `string` (and a not-yet-loaded `null`/`undefined`) because
 * callers reach it from raw API shapes as well as typed `Repository` values;
 * an unknown format degrades to `false` rather than throwing.
 */
export function supportsScanOnProxy(
  format: string | null | undefined,
): boolean {
  return SCAN_ON_PROXY_GATED_FORMATS.has(format as RepositoryFormat);
}
