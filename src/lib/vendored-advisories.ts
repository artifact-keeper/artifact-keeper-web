import type {
  AdvisoryScan,
  ComponentAdvisory,
  VendoredComponent,
} from "@/types/package-analysis";
import { severityRank } from "@/components/common/severity-badge";

/**
 * Helpers for the advisories attached to vendored native libraries.
 *
 * The whole point of this feature is that these components are invisible to a
 * metadata-only scanner: a `libwebp` compiled into a wheel is never named by
 * the package's own metadata, so CVE-2023-4863 does not show up on any
 * surface that reads declared dependencies. Everything here therefore treats
 * "we could not look" as its own outcome, never as a clean result.
 */

/**
 * Advisories ordered most-severe first, then by id for a stable order within
 * a severity. Unknown severity strings sort after every known one (they never
 * outrank `critical` and never hide behind it) — see `severityRank`.
 */
export function sortAdvisoriesBySeverity(
  advisories: readonly ComponentAdvisory[],
): ComponentAdvisory[] {
  return [...advisories].sort((a, b) => {
    const delta = severityRank(a.severity) - severityRank(b.severity);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

/**
 * Why a component has no advisory answer. `advisories: null` has three
 * distinct causes and they are not interchangeable in copy: "we never asked"
 * and "we asked and the feed went down" are different facts, and only one of
 * them is an outage.
 */
export type AdvisoryGap =
  /** No upstream version was recovered, so nothing was ever sent to a feed. */
  | "no_version"
  /** No completed dependency scan has recorded advisories yet. */
  | "not_scanned"
  /** A feed WAS asked and did not answer (outage, rate limit, timeout). */
  | "feed_unavailable"
  /** The backend did not say which of the above it was. */
  | "unknown";

export const ADVISORY_GAPS: readonly AdvisoryGap[] = [
  "feed_unavailable",
  "no_version",
  "not_scanned",
  "unknown",
];

/**
 * Classify why a component with `advisories === null` has no answer. Callers
 * check `advisories == null` themselves; this is a total function over the
 * remaining evidence so it can never be asked about a component that does
 * have an answer.
 *
 * `version === null` is checked FIRST and deliberately outranks the scan
 * status: a component with no recovered version was never sent to a feed, so
 * it is "not queried" even during an outage. Reporting it as a feed failure
 * would be as wrong in the other direction.
 */
export function advisoryGapFor(
  version: string | null,
  advisoryScan: AdvisoryScan | null | undefined,
): AdvisoryGap {
  if (version == null) return "no_version";
  switch (advisoryScan?.status) {
    case "partial":
      return "feed_unavailable";
    case "not_run":
      return "not_scanned";
    default:
      // "ok" lands here too: the feeds answered for the package, yet this
      // component has no answer. We cannot say why, so we do not guess.
      return "unknown";
  }
}

/**
 * Headline for each gap. Only `feed_unavailable` says an outage happened;
 * the rest say nothing was asked, which is what actually occurred.
 */
export const ADVISORY_GAP_LABEL: Record<AdvisoryGap, string> = {
  no_version: "Not queried",
  not_scanned: "Not queried",
  feed_unavailable: "Advisory feed unavailable",
  unknown: "Not queried",
};

/**
 * Secondary copy per gap. Every one of them ends in the same sentence — that
 * is the part that protects the reader, and it is true in all four cases.
 */
export const ADVISORY_GAP_EXPLANATION: Record<AdvisoryGap, string> = {
  no_version:
    "No upstream version was recovered for this component, so the advisory feeds were not queried. This is not a clean result.",
  not_scanned:
    "No completed dependency scan has recorded advisories for this package yet, so the advisory feeds were not queried. This is not a clean result.",
  feed_unavailable:
    "The advisory feed was queried but did not answer, so nothing is ruled out for this component. This is not a clean result.",
  unknown:
    "No advisory result was recorded for this component — it was either never queried or the feed did not answer. This is not a clean result.",
};

export interface VendoredAdvisorySummary {
  /** Total advisories across every component that was queried. */
  total: number;
  /** Components with at least one advisory. */
  affectedComponents: number;
  /**
   * Components whose `advisories` is `null`. These are NOT clean and are
   * reported separately so a caller can say "and N more we could not check".
   */
  notQueriedComponents: number;
  /** The same components, split by WHY they have no answer. */
  gaps: Record<AdvisoryGap, number>;
  /** Counts per raw severity string, lowercased. */
  bySeverity: Record<string, number>;
  /** Most severe advisory seen, or `null` when there are none. */
  worst: string | null;
}

/**
 * Roll a component list up into the numbers a summary surface needs.
 *
 * `total === 0` on its own says nothing: pair it with `notQueriedComponents`
 * (and, at the call site, with the analysis `completeness`) before telling
 * anyone the package is clean.
 */
export function summarizeVendoredAdvisories(
  components: readonly VendoredComponent[],
  advisoryScan?: AdvisoryScan | null,
): VendoredAdvisorySummary {
  const bySeverity: Record<string, number> = {};
  const gaps: Record<AdvisoryGap, number> = {
    no_version: 0,
    not_scanned: 0,
    feed_unavailable: 0,
    unknown: 0,
  };
  let total = 0;
  let affectedComponents = 0;
  let notQueriedComponents = 0;
  let worst: string | null = null;

  for (const c of components) {
    if (c.advisories == null) {
      notQueriedComponents++;
      gaps[advisoryGapFor(c.version, advisoryScan)]++;
      continue;
    }
    if (c.advisories.length > 0) affectedComponents++;
    for (const a of c.advisories) {
      total++;
      const key = a.severity.toLowerCase();
      bySeverity[key] = (bySeverity[key] ?? 0) + 1;
      if (worst === null || severityRank(a.severity) < severityRank(worst)) {
        worst = a.severity;
      }
    }
  }

  return {
    total,
    affectedComponents,
    notQueriedComponents,
    gaps,
    bySeverity,
    worst,
  };
}

/**
 * How a component's version should read.
 *
 * A `null` version is the normal, deliberate outcome for a native library:
 * the numbers in `libwebp.so.7` / `libjpeg.so.62.3.0` are ELF/libtool ABI
 * versions, and `libwebp.so.7` ships in libwebp *1.2.4*. The backend refuses
 * to promote an ABI version to an upstream one because a confident wrong
 * version matches the wrong advisories. So the UI says the version is not
 * determinable and shows the ABI it does have — it is not an error and not an
 * empty cell.
 */
export const ABI_VERSION_EXPLANATION =
  "The number in a library's file name or soname is an ELF/libtool ABI version, not an upstream release (libwebp.so.7 ships in libwebp 1.2.4). It is not promoted to a version because a wrong version matches the wrong advisories.";


/**
 * Stable per-row identity for a vendored component.
 *
 * `path` used to serve this purpose, but the backend only sends it for
 * components located by reading a file; a recipe-derived component has no
 * path, and inventing one to act as a key would put a fabricated value in a
 * column reviewers read as fact.
 *
 * `path` stays first so components that HAVE one keep the identity they
 * already had -- only the previously-broken path-less case changes. `purl` is
 * the next-best real identifier, and the `name@version#index` fallback is
 * stable across re-renders while the index disambiguates the genuinely
 * ambiguous case of one package vendoring the same library twice.
 */
export function vendoredComponentKey(
  c: { purl?: string | null; path?: string | null; name: string; version?: string | null },
  index: number
): string {
  return c.path ?? c.purl ?? `${c.name}@${c.version ?? "unknown"}#${index}`;
}
