import type { FormatHandler } from "@/lib/api/format-handlers";
import type { Repository } from "@/types";

/**
 * Display helpers for repository formats, including custom layouts provided
 * by WASM plugin format handlers (#591/#592).
 *
 * Backend contract (migration 065): a plugin-backed repository is stored as
 * `format = "generic"` plus `format_key = <plugin format key>`. Rendering
 * `format` alone therefore shows a bare "GENERIC" for plugin repos — these
 * helpers resolve the plugin layout identity instead.
 */

type RepoFormatFields = Pick<Repository, "format" | "format_key">;

type FormatHandlerLike = Pick<FormatHandler, "format_key" | "display_name">;

/** True when the repository is backed by a WASM plugin layout. */
export function isPluginBackedRepo(repo: RepoFormatFields): boolean {
  return repo.format === "generic" && !!repo.format_key;
}

/**
 * Human-readable label for a repository's format.
 *
 * Plugin-backed repos resolve to the handler's `display_name` when the
 * installed format handlers are known, falling back to the raw `format_key`
 * (the layout id) so an unknown or uninstalled plugin id still renders
 * something meaningful. Built-in formats return the format id unchanged, so
 * callers can keep their existing uppercasing.
 */
export function repoFormatLabel(
  repo: RepoFormatFields,
  handlers?: FormatHandlerLike[] | null,
): string {
  if (isPluginBackedRepo(repo)) {
    const handler = handlers?.find((h) => h.format_key === repo.format_key);
    return handler?.display_name ?? (repo.format_key as string);
  }
  return repo.format;
}
