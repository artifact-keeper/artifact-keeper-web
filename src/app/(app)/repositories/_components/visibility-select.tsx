"use client";

/**
 * Repository visibility control, shared verbatim by the create dialog
 * (`repo-dialogs.tsx`) and the settings tab (`repo-settings-tab.tsx`) so the
 * two surfaces never drift.
 *
 * Replaces the binary "Public repository" switch. The switch could express only
 * "anyone including anonymous" or "grant holders only", with no way to say
 * "everyone signed in", which is what most repositories on a corporate instance
 * actually need.
 *
 * ## Why the control stays visible when guest access is off
 *
 * The switch used to be hidden entirely, replaced by "Public repositories are
 * disabled by the operator". That made sense when the only two states were
 * public and private and one of them was unavailable. It does not now: with
 * guest access off, `public` is unavailable but the choice between `internal`
 * and `private` is still meaningful and still the operator's to make. So the
 * control stays and only the `public` option is withdrawn, with a line saying
 * why.
 *
 * Controlled and presentational: it owns no state and reports the next value on
 * every change, matching `format-config-fields.tsx`.
 */

import type { RepositoryVisibility } from "@/types";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export interface VisibilitySelectProps {
  /** Prefix for the generated element ids, e.g. `"create"` or `"settings"`. */
  idPrefix: string;
  value: RepositoryVisibility;
  onChange: (next: RepositoryVisibility) => void;
  /**
   * Server-wide guest-access policy. When false, `public` is withdrawn: nothing
   * anonymous would ever reach such a repository, and the backend coerces a
   * request for it to `internal` anyway.
   */
  guestAccessEnabled: boolean;
  disabled?: boolean;
}

export function VisibilitySelect({
  idPrefix,
  value,
  onChange,
  guestAccessEnabled,
  disabled,
}: VisibilitySelectProps) {
  const options = guestAccessEnabled
    ? VISIBILITY_OPTIONS
    : VISIBILITY_OPTIONS.filter((o) => o.value !== "public");

  // A repository that is already public while guest access is off (set before
  // the policy changed) must still render its own value, or the trigger would
  // show an empty box and any save would silently move it.
  const showsWithdrawnValue = !guestAccessEnabled && value === "public";
  const visible = showsWithdrawnValue ? VISIBILITY_OPTIONS : options;
  const active = visible.find((o) => o.value === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-visibility`}>Visibility</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as RepositoryVisibility)}
        disabled={disabled}
      >
        <SelectTrigger id={`${idPrefix}-visibility`}>
          <SelectValue placeholder="Select visibility" />
        </SelectTrigger>
        <SelectContent>
          {visible.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active ? (
        <p className="text-xs text-muted-foreground">{active.hint}</p>
      ) : null}
      {!guestAccessEnabled ? (
        <p className="text-xs text-muted-foreground">
          Public repositories are disabled by the operator. Internal
          repositories are still readable by every signed-in user.
        </p>
      ) : null}
    </div>
  );
}
