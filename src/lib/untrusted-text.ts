/**
 * Display rules for text this app does not control: repository descriptions,
 * MCP capability names and descriptions, a CI report's `generatedBy` label, and
 * a Remote catalog's upstream title and description. The backend validates
 * some of these on one path and leaves others as stored, so the UI applies one
 * rule everywhere (#1107).
 *
 * Nothing here is an escaping concern (React already renders these as inert
 * text). It is about what a reader *sees*: a bidi override makes `\u202egnp.exe`
 * read as `exe.png`, and invisible characters make two different strings look
 * the same. Such characters are shown as a visible `[U+XXXX]` instead of being
 * dropped, so the reader can see that something is there.
 */

/**
 * Escaped: C0 controls except tab, line feed and carriage return; DEL and the
 * C1 controls; the bidi embeddings, overrides and isolates (U+202A-E,
 * U+2066-9); line and paragraph separators; the invisible zero-width space,
 * word joiner and BOM; and Unicode tag characters (U+E0000-E007F).
 *
 * Deliberately NOT escaped:
 * - U+200C and U+200D (zero-width non-joiner / joiner), which real text needs
 *   (Persian, emoji sequences such as family emoji).
 * - The bidi marks U+200E/F (LRM/RLM) and U+061C (ALM), which are routine in
 *   Hebrew and Arabic text and only nudge neutral characters; they cannot
 *   reverse a run the way an override does.
 * - The three subdivision flags Unicode recommends (U+1F3F4, the tag letters
 *   `gbeng`, `gbsct` or `gbwls`, U+E007F cancel tag): England, Scotland and
 *   Wales. No other tag sequence renders as a flag, so any other tag run is
 *   escaped, even one in a flag's shape (#1202).
 * The cost is that a hidden character built from those is not flagged.
 */
const ESCAPED =
  /(\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F})|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;

export const DEFAULT_MAX_LENGTH = 1000;
/** Names, keys and labels are short; anything much longer is not a name. */
export const NAME_MAX_LENGTH = 200;

export interface UntrustedText {
  /** What to render: escaped and, if too long, cut with an ellipsis. */
  text: string;
  /** The escaped text before it was cut, for a tooltip. */
  full: string;
  /** How many characters were shown as `[U+XXXX]`. */
  escaped: number;
  truncated: boolean;
}

function show(codePoint: number): string {
  return `[U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}]`;
}

export function formatUntrustedText(
  input: string | null | undefined,
  options: { max?: number } = {},
): UntrustedText {
  const max = options.max ?? DEFAULT_MAX_LENGTH;
  let escaped = 0;
  const full = (input ?? "").replace(ESCAPED, (ch, flag?: string) => {
    if (flag) return flag;
    escaped += 1;
    return show(ch.codePointAt(0) ?? 0);
  });

  // Count by code point (so a long run of combining marks still counts), but
  // cut only between graphemes, so a joined emoji or a flag is never split.
  if (Array.from(full).length <= max) return { text: full, full, escaped, truncated: false };
  return { text: `${cut(full, max)}…`, full, escaped, truncated: true };
}

/** The longest run of whole graphemes from the start that has at most `max` code points. */
function cut(text: string, max: number): string {
  const Segmenter = typeof Intl !== "undefined" ? Intl.Segmenter : undefined;
  if (!Segmenter) return Array.from(text).slice(0, max).join("");
  let out = "";
  let count = 0;
  for (const { segment } of new Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    const size = Array.from(segment).length;
    if (count + size > max) break;
    out += segment;
    count += size;
  }
  return out;
}

/** Plain-string form for places that cannot render the component (labels, attributes). */
export function safeText(input: string | null | undefined, options?: { max?: number }): string {
  return formatUntrustedText(input, options).text;
}
