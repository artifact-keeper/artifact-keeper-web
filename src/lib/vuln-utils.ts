/**
 * Utility functions for vulnerability identifier handling.
 *
 * Vulnerability findings can carry different identifier types (CVE, GHSA, etc.).
 * These helpers determine the correct display label and advisory URL for each type.
 */

/** Check whether an identifier looks like a CVE (e.g. CVE-2024-1234). */
export function isCveId(id: string): boolean {
  return /^CVE-\d{4}-\d+$/i.test(id);
}

/** Check whether an identifier looks like a GitHub Security Advisory (e.g. GHSA-xxxx-xxxx-xxxx). */
export function isGhsaId(id: string): boolean {
  return /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(id);
}

/**
 * Return the appropriate advisory URL for a vulnerability identifier.
 *
 * - CVE identifiers link to NVD: https://nvd.nist.gov/vuln/detail/CVE-XXXX-XXXXX
 * - GHSA identifiers link to GitHub: https://github.com/advisories/GHSA-xxxx-xxxx-xxxx
 * - Unknown formats return null (no link).
 */
export function advisoryUrl(id: string): string | null {
  if (isCveId(id)) {
    return `https://nvd.nist.gov/vuln/detail/${id}`;
  }
  if (isGhsaId(id)) {
    return `https://github.com/advisories/${id}`;
  }
  return null;
}

/**
 * Classify a vulnerability identifier string for display purposes.
 *
 * Returns the identifier type as a short label ("CVE", "GHSA", or "Advisory").
 */
export function vulnIdType(id: string): "CVE" | "GHSA" | "Advisory" {
  if (isCveId(id)) return "CVE";
  if (isGhsaId(id)) return "GHSA";
  return "Advisory";
}
