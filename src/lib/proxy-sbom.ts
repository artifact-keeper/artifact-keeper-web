import type {
  ProxySbomCompleteness,
  ProxySbomComponent,
  ProxySbomFormat,
  ProxySbomInventory,
} from "@/types/proxy-sbom";

/**
 * Pure parsing and copy for proxy-cache SBOMs.
 *
 * The endpoint serves a CycloneDX or SPDX *document*, not a pre-normalized
 * component list, so the table shape is derived here. Kept out of the
 * component so every document variant — and the empty cases that must not
 * render as "no dependencies" — is testable without a rendered tree.
 */

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Shown when the endpoint has no inventory for this path.
 *
 * The distinction this copy exists to preserve: **an empty inventory is not an
 * empty SBOM.** Rendering a zero-row component table would assert that the
 * artifact has no dependencies, which nothing in the data supports — the same
 * class of bug as the green all-clear shield.
 */
export const PROXY_SBOM_NOT_RECORDED_COPY =
  "No SBOM recorded for this artifact yet — it will be generated the next " +
  "time the artifact is pulled.";

/**
 * The reassurance that goes with it.
 *
 * Only digests pulled after the inventory feature ships have one recorded, so
 * on any existing deployment the empty state is what most users meet first.
 * Without this line it reads as a fault; with it, it reads as a not-yet.
 */
export const PROXY_SBOM_NOT_RECORDED_REASON =
  "Artifacts cached before inventory recording was enabled do not have one " +
  "until they are pulled again. This is expected and does not indicate a " +
  "problem with the artifact.";

/**
 * What the document actually is. The scan catalogs what it finds inside the
 * archive; it does not resolve a dependency graph, and for npm it can list
 * declared transitives the tarball does not vendor. Labelling it as a
 * dependency tree would overstate it.
 */
export const PROXY_SBOM_INVENTORY_CAVEAT =
  "This is the package inventory the scanner cataloged from the archive at " +
  "download time, not a resolved transitive dependency tree.";

/**
 * Shown when the scan itself reported that it did not catalog everything.
 * Presenting a knowingly-partial inventory as the artifact's full contents is
 * the same failure mode as an empty table reading as "no dependencies".
 */
export const PROXY_SBOM_PARTIAL_COPY =
  "The scan reported this inventory as incomplete — it is missing components " +
  "it could not catalog. Treat it as a partial list, not as the artifact's " +
  "full contents.";

/** Shown on proxy repositories whose format never runs an inline scan. */
export const PROXY_SBOM_FORMAT_UNSUPPORTED_COPY =
  "SBOMs are only recorded for PyPI, npm and Docker/OCI proxy repositories. " +
  "Other formats have no inline scan to catalog from.";

/**
 * On-demand generation stays hosted-only: proxy content has no `artifacts`
 * row, so the generate endpoint 404s for it. Naming the alternative keeps the
 * panel from reporting a gap with no way to close it.
 */
export const PROXY_SBOM_GENERATION_NOTE =
  "Proxy SBOMs are recorded by the download-time scan and cannot be generated " +
  "on demand. To produce one now, pull the artifact through this repository, " +
  "or ingest it into a hosted repository and generate an SBOM there.";

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/**
 * Formats whose proxy download path runs an inline scan, and therefore have an
 * inventory to serve. Docker/OCI is included here (unlike the verdict summary)
 * because the OCI proxy path does scan, even though its verdicts live in a
 * different store.
 */
const PROXY_SBOM_FORMATS: ReadonlySet<string> = new Set([
  "npm",
  "pypi",
  "docker",
  "oci",
  "podman",
  "oras",
]);

/** Whether this repository's format can have a recorded proxy SBOM. */
export function formatHasProxySbom(format: string | null | undefined): boolean {
  return PROXY_SBOM_FORMATS.has(format ?? "");
}

// ---------------------------------------------------------------------------
// Document parsing
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Trim, and treat blanks and SPDX's NOASSERTION/NONE sentinels as absent. */
function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "NOASSERTION" || trimmed === "NONE") return null;
  return trimmed;
}

/**
 * CycloneDX licenses are an array of either `{license: {id|name}}` or
 * `{expression}`. Take the first that resolves so the column stays one line.
 */
function cycloneDxLicense(component: Json): string | null {
  for (const raw of asArray(component.licenses)) {
    const entry = asObject(raw);
    if (!entry) continue;
    const expression = cleanString(entry.expression);
    if (expression) return expression;
    const license = asObject(entry.license);
    if (!license) continue;
    const id = cleanString(license.id) ?? cleanString(license.name);
    if (id) return id;
  }
  return null;
}

function cycloneDxComponents(doc: Json): ProxySbomComponent[] {
  return asArray(doc.components)
    .map(asObject)
    .filter((c): c is Json => c !== null)
    .map((c) => ({
      name: cleanString(c.name) ?? "",
      version: cleanString(c.version),
      license: cycloneDxLicense(c),
      purl: cleanString(c.purl),
    }))
    .filter((c) => c.name !== "");
}

/**
 * SPDX records the purl as an external reference with
 * `referenceType: "purl"`. `referenceCategory` spelling varies between SPDX
 * 2.2 and 2.3 documents, so match on the type alone.
 */
function spdxPurl(pkg: Json): string | null {
  for (const raw of asArray(pkg.externalRefs)) {
    const ref = asObject(raw);
    if (!ref) continue;
    if (cleanString(ref.referenceType)?.toLowerCase() !== "purl") continue;
    const locator = cleanString(ref.referenceLocator);
    if (locator) return locator;
  }
  return null;
}

function spdxPackages(doc: Json): ProxySbomComponent[] {
  return asArray(doc.packages)
    .map(asObject)
    .filter((p): p is Json => p !== null)
    .map((p) => ({
      name: cleanString(p.name) ?? "",
      version: cleanString(p.versionInfo),
      // Concluded is the stronger claim; fall back to declared.
      license: cleanString(p.licenseConcluded) ?? cleanString(p.licenseDeclared),
      purl: spdxPurl(p),
    }))
    .filter((c) => c.name !== "");
}

/** Which document format this body is, judged by its own self-description. */
export function detectSbomFormat(doc: Json): ProxySbomFormat | "unknown" {
  if (typeof doc.bomFormat === "string" && doc.bomFormat.toLowerCase() === "cyclonedx") {
    return "cyclonedx";
  }
  if (typeof doc.spdxVersion === "string") return "spdx";
  // Fall back to the shape when the document omits its own marker.
  if (Array.isArray(doc.components)) return "cyclonedx";
  if (Array.isArray(doc.packages)) return "spdx";
  return "unknown";
}

/**
 * Unwrap the response body down to the document.
 *
 * The endpoint is documented as returning "a CycloneDX or SPDX document",
 * which leaves open whether it is served bare or inside an envelope. Accept a
 * bare document, `{document: …}`, and `{sbom: …}`, and accept a document
 * delivered as a JSON string, so the panel is not coupled to that choice.
 */
export function unwrapSbomDocument(raw: unknown): Json | null {
  let value = raw;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  const body = asObject(value);
  if (!body) return null;

  for (const key of ["document", "sbom"] as const) {
    if (key in body) {
      const nested = unwrapSbomDocument(body[key]);
      // An envelope with an explicitly null document is "nothing recorded",
      // not "fall through and parse the envelope itself".
      return nested;
    }
  }
  return body;
}

/**
 * Read a completeness claim out of a CycloneDX `metadata.properties` array,
 * which is where a generator records non-standard facts about its own output.
 */
function completenessFromProperties(doc: Json): string | null {
  const metadata = asObject(doc.metadata);
  if (!metadata) return null;
  for (const raw of asArray(metadata.properties)) {
    const property = asObject(raw);
    if (!property) continue;
    const name = cleanString(property.name)?.toLowerCase();
    // Generators namespace their properties (`artifact-keeper:…`), so match on
    // the suffix rather than an exact key.
    if (!name || !name.includes("completeness")) continue;
    const value = cleanString(property.value);
    if (value) return value;
  }
  return null;
}

/**
 * Whether the scan claimed to have cataloged everything.
 *
 * Checked in three places because the backend has not pinned down where it
 * records this: the response envelope, the document root, and CycloneDX
 * `metadata.properties`.
 *
 * An absent claim is `unknown`, not `complete`. The UI must not assert
 * completeness the data does not support, and must not warn on every SBOM
 * served by a backend that never emits the field — so only an explicit
 * non-complete value raises the banner.
 */
export function detectInventoryCompleteness(
  raw: unknown,
  doc: Json | null,
): ProxySbomCompleteness {
  const envelope = asObject(raw);
  const claim =
    cleanString(envelope?.inventory_completeness) ??
    cleanString(doc?.inventory_completeness) ??
    (doc ? completenessFromProperties(doc) : null);

  if (!claim) return "unknown";
  return claim.toLowerCase() === "complete" ? "complete" : "partial";
}

/**
 * Normalize a response body into what the panel renders.
 *
 * Returns `absent` for a missing document *and* for a document that catalogs
 * nothing. Those are not distinguishable in the data, and conflating them is
 * safe in one direction only: reporting "no inventory recorded" when a
 * document happens to be empty is honest, whereas rendering an empty table
 * would assert the artifact has no dependencies.
 */
export function parseProxySbom(raw: unknown): ProxySbomInventory {
  const doc = unwrapSbomDocument(raw);
  if (!doc) return { kind: "absent" };

  const format = detectSbomFormat(doc);
  const components =
    format === "spdx" ? spdxPackages(doc) : cycloneDxComponents(doc);

  if (components.length === 0) return { kind: "absent" };
  return {
    kind: "present",
    format,
    components,
    completeness: detectInventoryCompleteness(raw, doc),
  };
}

/** Pretty-print the document for the raw viewer and the download. */
export function formatSbomDocument(raw: unknown): string {
  const doc = unwrapSbomDocument(raw);
  if (!doc) return "";
  return JSON.stringify(doc, null, 2);
}

/** Distinct licenses across the inventory, sorted, excluding unknowns. */
export function sbomLicenseSummary(
  components: ProxySbomComponent[],
): string[] {
  const seen = new Set<string>();
  for (const component of components) {
    if (component.license) seen.add(component.license);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
