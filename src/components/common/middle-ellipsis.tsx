import { cn } from "@/lib/utils";

/**
 * Number of trailing characters kept verbatim when a value is elided.
 *
 * Artifact filenames carry their most distinguishing information at BOTH
 * ends: the package name at the front, the version / variant / extension at
 * the back. End-truncation collapses that tail, rendering
 * `foo-cloudflare-tlsconsul` and `foo-cloudflare-tlsconsul-docker`
 * indistinguishable. 12 characters is enough for a `-docker` style variant
 * suffix or a `.tar.gz` extension.
 */
const DEFAULT_TAIL_LENGTH = 12;

/**
 * Split `text` into the part that may be clipped and the tail that must stay
 * visible.
 *
 * Returns an empty tail when the value is too short for a middle ellipsis to
 * be worth it — below roughly twice the tail length, eliding hides more than
 * it reveals, so the value is left whole (and simply end-truncates if it
 * still does not fit).
 *
 * Exported for testing: the visual result depends on flexbox, which jsdom
 * does not lay out, so the split is pinned here as a pure function.
 */
export function splitForMiddleEllipsis(
  text: string,
  tailLength: number = DEFAULT_TAIL_LENGTH,
): { head: string; tail: string } {
  // A non-positive tail degenerates to plain end-truncation.
  if (tailLength <= 0 || text.length <= tailLength * 2) {
    return { head: text, tail: "" };
  }
  return {
    head: text.slice(0, text.length - tailLength),
    tail: text.slice(text.length - tailLength),
  };
}

export interface MiddleEllipsisProps {
  /** The full value. Always exposed verbatim as the native tooltip. */
  text: string;
  /** Trailing characters kept visible. Defaults to 12. */
  tailLength?: number;
  className?: string;
}

/**
 * Renders `text` on one line, eliding the MIDDLE rather than the end when it
 * does not fit the available width.
 *
 * CSS `text-overflow: ellipsis` can only elide the end, so the value is split
 * into two spans: the head is allowed to shrink and truncate, the tail is
 * pinned with `shrink-0`. The ellipsis therefore lands between them, and the
 * result is width-responsive — no character-count guesswork against a
 * container whose width is not known until layout.
 *
 * The caller must provide the width bound. This component only shrinks to
 * whatever its flex parent allows, so an ancestor needs a width cap (and
 * `min-w-0` on the intervening flex items) for the elision to ever trigger.
 */
export function MiddleEllipsis({
  text,
  tailLength,
  className,
}: MiddleEllipsisProps) {
  const { head, tail } = splitForMiddleEllipsis(text, tailLength);

  return (
    <span className={cn("flex min-w-0 items-baseline", className)} title={text}>
      <span className="truncate">{head}</span>
      {/* Pinned: the tail is what end-truncation would have eaten. Kept short
          by `splitForMiddleEllipsis` so it cannot itself overflow the cap.
          `whitespace-nowrap` is explicit rather than inherited, so the tail
          cannot wrap when used outside a `whitespace-nowrap` table cell. */}
      {tail && <span className="shrink-0 whitespace-nowrap">{tail}</span>}
    </span>
  );
}
