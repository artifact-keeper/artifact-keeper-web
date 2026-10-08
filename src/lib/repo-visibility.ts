/**
 * Three-state repository visibility (web #839, backend artifact-keeper#3813):
 * the human-facing copy and the resolvers every surface that displays a
 * repository's visibility shares, so the list, the detail header, the edit
 * surfaces and the blast-radius report can never disagree about a label.
 */

import type { RepositoryVisibility } from "@/types";

/** Human-facing copy for each state, kept in one place. */
export const VISIBILITY_OPTIONS: ReadonlyArray<{
  value: RepositoryVisibility;
  label: string;
  hint: string;
}> = [
  {
    value: "public",
    label: "Public",
    hint: "Anyone can read, including unauthenticated callers.",
  },
  {
    value: "internal",
    label: "Internal",
    hint: "Any signed-in user can read. Never readable anonymously.",
  },
  {
    value: "private",
    label: "Private",
    hint: "Only users granted access can read.",
  },
];

/**
 * Resolve a repository's visibility for display.
 *
 * Falls back to the legacy boolean when the backend predates the field, so an
 * older server still renders correctly. The fallback can only produce `public`
 * or `private` — a boolean cannot express `internal` — which is the same
 * degradation the API contract describes.
 */
export function resolveVisibility(repo: {
  visibility?: RepositoryVisibility;
  is_public?: boolean;
}): RepositoryVisibility {
  return repo.visibility ?? (repo.is_public ? "public" : "private");
}

/**
 * Visibility implied by a blast-radius `access_scope`.
 *
 * `access_scope` is the field that distinguishes `internal` (every signed-in
 * user) from the restricted states; the `is_public` mirror beside it cannot.
 * Both `restricted_*` scopes are private repositories. A scope this UI does not
 * know yet falls back to the boolean rather than guessing.
 */
export function visibilityFromAccessScope(
  scope: string,
  isPublic: boolean,
): RepositoryVisibility {
  if (scope === "public" || scope === "internal") return scope;
  if (scope === "restricted_acl" || scope === "restricted_roles") return "private";
  return isPublic ? "public" : "private";
}

/** Display label ("Public" / "Internal" / "Private") for a visibility. */
export function visibilityLabel(visibility: RepositoryVisibility): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.label ?? visibility;
}
