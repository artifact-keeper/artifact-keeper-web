/**
 * Helpers for the SAML provider `slug` (backend 1.10.0,
 * artifact-keeper#2583, migration 218).
 *
 * A slug is an optional operator-chosen alias that the public SAML routes
 * accept in place of the provider's UUID, so the ACS URL registered at the
 * IdP survives a deployment being rebuilt from scratch. These helpers are
 * pure so the SSO settings form can validate before submitting and render
 * the resulting URLs without a round trip.
 */

/** Maximum slug length, matching `VARCHAR(64)` in migration 218. */
export const SAML_SLUG_MAX_LENGTH = 64;

/**
 * Character class the backend enforces (`saml_configs_slug_check`): a
 * lowercase letter or digit, then lowercase letters, digits, `-` or `_`.
 * Deliberately narrow because the slug becomes a path segment in
 * `/api/v1/auth/sso/saml/{slug}/acs`.
 */
export const SAML_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Canonical UUID spelling, in any case — matches the backend's parse. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a slug the way `validate_saml_slug` does server-side, in the
 * same order, so the inline message matches the one a submit would return.
 *
 * An empty string is valid and means "no slug": the provider stays
 * addressable by its id only, which is what every provider that predates
 * the column does.
 *
 * @returns an error message, or `null` when the value is acceptable.
 */
export function validateSamlSlug(slug: string): string | null {
  if (slug === "") return null;
  if (slug.length > SAML_SLUG_MAX_LENGTH) {
    return `Slug must be at most ${SAML_SLUG_MAX_LENGTH} characters.`;
  }
  if (!SAML_SLUG_PATTERN.test(slug)) {
    return "Slug must start with a lowercase letter or digit and contain only lowercase letters, digits, hyphens and underscores.";
  }
  if (UUID_PATTERN.test(slug)) {
    return "Slug must not be a UUID — the login and ACS routes resolve a UUID as a provider id, so such a slug would never be reached.";
  }
  return null;
}

/**
 * Public login and ACS URLs for a SAML provider, addressed by its slug when
 * one is set and by its id otherwise (artifact-keeper#2583 made both routes
 * accept either). Absolute, because the operator copies these into an IdP
 * console where a host-less path is useless: prefer the configured API
 * origin, fall back to the browser origin, and yield a bare path during SSR
 * rather than guessing a host — the same rule
 * `artifactsApi.getAbsoluteDownloadUrl` follows.
 *
 * @returns the two URLs, or `null` when the provider has neither an id
 *   (not created yet) nor a slug, and so has no address to show.
 */
export function samlAuthUrls(config: {
  id?: string | null;
  slug?: string | null;
}): { loginUrl: string; acsUrl: string } | null {
  const segment = config.slug || config.id;
  if (!segment) return null;
  const origin =
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const base = `${origin}/api/v1/auth/sso/saml/${encodeURIComponent(segment)}`;
  return { loginUrl: `${base}/login`, acsUrl: `${base}/acs` };
}

/**
 * Which form field a failed SAML write collided on, if any.
 *
 * Since artifact-keeper#2583 a duplicate name or slug is a 409 naming the
 * colliding value (it used to be a generic 500), so the form can point at
 * the offending input instead of raising a toast the operator has to
 * interpret. Recognizes both error shapes the app produces: the SDK's
 * parsed error body (`{ code: "CONFLICT", message }`) and `ApiError`
 * (`.status`, with the body folded into `.message`).
 *
 * @returns `"slug"` or `"name"`, or `null` when the error is not a conflict.
 */
export function samlConflictField(error: unknown): "name" | "slug" | null {
  if (error === null || typeof error !== "object") return null;
  const { code, status, message } = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  if (code !== "CONFLICT" && status !== 409) return null;
  return typeof message === "string" && /slug/i.test(message)
    ? "slug"
    : "name";
}
