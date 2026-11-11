/**
 * The pending TOTP token from a sign-in answer that stopped at the second
 * factor, or null when the answer carries a session (artifact-keeper#5484).
 *
 * `POST /auth/login`, LDAP login (`POST /auth/sso/ldap/{id}/login`) and the
 * OIDC/SAML code exchange (`POST /auth/sso/exchange`) all answer a
 * TOTP-enrolled account with `{ totp_required: true, totp_token, ... }` and
 * empty `access_token` / `refresh_token`, without setting cookies. The token
 * is redeemed at `POST /auth/totp/verify`, which sets the session cookies.
 * Read through `unknown` because SDK 1.7.0 predates these fields on the LDAP
 * and exchange responses.
 */
export function totpChallengeToken(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const obj = body as { totp_required?: unknown; totp_token?: unknown };
  if (obj.totp_required !== true) return null;
  return typeof obj.totp_token === 'string' && obj.totp_token !== ''
    ? obj.totp_token
    : null;
}
