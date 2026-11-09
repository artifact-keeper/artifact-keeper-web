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
 * C1 controls; the bidi marks, embeddings, overrides and isolates (U+061C,
 * U+200E/F, U+202A-E, U+2066-9); line and paragraph separators; and the
 * invisible zero-width space, word joiner and BOM.
 *
 * Deliberately NOT escaped: U+200C and U+200D (zero-width non-joiner / joiner),
 * which real text needs (Persian, emoji sequences such as family emoji). The
 * cost is that a hidden character built from those two is not flagged.
 */
const ESCAPED =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;

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
  const full = (input ?? "").replace(ESCAPED, (ch) => {
    escaped += 1;
    return show(ch.codePointAt(0) ?? 0);
  });

  // Count and cut by code point so a surrogate pair is never split.
  const points = Array.from(full);
  if (points.length <= max) return { text: full, full, escaped, truncated: false };
  return { text: `${points.slice(0, max).join("")}…`, full, escaped, truncated: true };
}

/** Plain-string form for places that cannot render the component (labels, attributes). */
export function safeText(input: string | null | undefined, options?: { max?: number }): string {
  return formatUntrustedText(input, options).text;
}
