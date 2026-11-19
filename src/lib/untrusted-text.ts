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
 * C1 controls; line and paragraph separators; and every Unicode
 * Default_Ignorable_Code_Point (bidi embeddings, overrides and isolates,
 * zero-width space, word joiner, invisible operators such as U+2062, soft
 * hyphen, combining grapheme joiner, Hangul fillers, variation selectors, tag
 * characters and the rest) except the ones listed below (#1226).
 *
 * The Default_Ignorable_Code_Point ranges are taken from Unicode 18.0.0,
 * DerivedCoreProperties-18.0.0.txt:
 *   00AD, 034F, 061C, 115F..1160, 17B4..17B5, 180B..180D, 180E, 180F,
 *   200B..200F, 202A..202E, 2060..2064, 2065, 2066..206F, 3164, FE00..FE0F,
 *   FEFF, FFA0, FFF0..FFF8, 1BCA0..1BCA3, 1D173..1D17A, E0000, E0001,
 *   E0002..E001F, E0020..E007F, E0080..E00FF, E0100..E01EF, E01F0..E0FFF
 *
 * Deliberately NOT escaped:
 * - The bidi marks U+200E/F (LRM/RLM) and U+061C (ALM), which are routine in
 *   Hebrew and Arabic text and only nudge neutral characters; they cannot
 *   reverse a run the way an override does.
 * - U+200D (ZWJ) and VS15/VS16 (U+FE0E/F) inside an emoji sequence: a ZWJ
 *   between two emoji (family, rainbow flag), a variation selector straight
 *   after an emoji, or a keycap (`1`, VS16, U+20E3). Anywhere else they are
 *   escaped, so `pay\u200Dpal` is flagged.
 * - U+200C and U+200D (ZWNJ / ZWJ) between two letters of a script that
 *   needs them to choose a letter form (Arabic-script languages such as
 *   Persian, Syriac, N'Ko, Mongolian, and the Indic and Southeast Asian
 *   scripts). Between Latin, Greek, Cyrillic or other letters they are escaped.
 * - The three subdivision flags Unicode recommends (U+1F3F4, the tag letters
 *   `gbeng`, `gbsct` or `gbwls`, U+E007F cancel tag): England, Scotland and
 *   Wales. No other tag sequence renders as a flag, so any other tag run is
 *   escaped, even one in a flag's shape (#1202).
 * The cost is that a hidden character built from those is not flagged.
 */
const PICTO = String.raw`\p{Extended_Pictographic}(?:[\u{FE0E}\u{FE0F}]|\p{Emoji_Modifier})?`;
const JOINING_SCRIPT = String.raw`[\p{sc=Arabic}\p{sc=Syriac}\p{sc=Nko}\p{sc=Mongolian}\p{sc=Devanagari}\p{sc=Bengali}\p{sc=Gurmukhi}\p{sc=Gujarati}\p{sc=Oriya}\p{sc=Tamil}\p{sc=Telugu}\p{sc=Kannada}\p{sc=Malayalam}\p{sc=Sinhala}\p{sc=Khmer}\p{sc=Myanmar}]`;
const KEEP = [
  // Subdivision flags.
  String.raw`\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}`,
  // Keycaps.
  String.raw`[0-9#*]\u{FE0F}?\u{20E3}`,
  // An emoji, its presentation selector or skin tone, and any ZWJ-joined emoji.
  `${PICTO}(?:\\u{200D}${PICTO})*`,
  // A joiner between two letters of a script that uses it.
  `(?<=${JOINING_SCRIPT}\\p{M}*)[\\u{200C}\\u{200D}](?=${JOINING_SCRIPT})`,
].join("|");
const HIDDEN = String.raw`[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200D\u2028-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF0-\uFFF8\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}-\u{E0FFF}]`;
const ESCAPED = new RegExp(`(${KEEP})|${HIDDEN}`, "gu");

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
  const full = (input ?? "").replace(ESCAPED, (ch, keep?: string) => {
    if (keep) return keep;
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
