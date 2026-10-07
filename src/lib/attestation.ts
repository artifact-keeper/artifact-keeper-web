/**
 * Reading a package's publish attestation out of its artifact metadata.
 *
 * A conda package's CEP-27 attestation is stored as a Sigstore bundle under
 * `metadata.attestation`, and the registry's verification of it under
 * `metadata.attestation_verification`. Two record shapes are read:
 *
 * - backend 1.11.0: `{verified, method, identity, issuer, key_fingerprint,
 *   verified_at}` where `method` is `sigstore-keyless` or `sigstore-key`;
 * - backend 1.10.x: `{state, identity, issuer, error, verified_at, ...}`
 *   with `state` one of `verified`, `failed`, `unverified`.
 *
 * Fail-safe: only an explicit `verified: true` or `state: "verified"` reads as
 * verified. Anything else with a bundle is "unverified" (or "failed" when the
 * record says so), and no bundle and no record is "none".
 */

export type AttestationState = "verified" | "failed" | "unverified" | "none";

export interface AttestationSummary {
  state: AttestationState;
  /** `sigstore-keyless`, `sigstore-key`, or whatever the backend sent. */
  method?: string;
  identity?: string;
  issuer?: string;
  keyFingerprint?: string;
  verifiedAt?: string;
  error?: string;
  /** Whether the bundle itself is stored (so it can be downloaded). */
  hasBundle: boolean;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function readAttestation(
  metadata: Record<string, unknown> | null | undefined,
): AttestationSummary {
  const bundle = metadata?.attestation;
  const hasBundle = bundle !== undefined && bundle !== null;
  const record = metadata?.attestation_verification;
  if (!isObject(record)) {
    return { state: hasBundle ? "unverified" : "none", hasBundle };
  }

  const keyFingerprint = str(record.key_fingerprint);
  const identity = str(record.identity);
  const method =
    str(record.method) ??
    (keyFingerprint ? "sigstore-key" : identity ? "sigstore-keyless" : undefined);

  let state: AttestationState;
  if (record.verified === true || record.state === "verified") {
    state = "verified";
  } else if (record.state === "failed" || (record.verified === false && str(record.error))) {
    state = "failed";
  } else {
    state = hasBundle ? "unverified" : "none";
  }

  return {
    state,
    method,
    identity,
    issuer: str(record.issuer),
    keyFingerprint,
    verifiedAt: str(record.verified_at),
    error: str(record.error),
    hasBundle,
  };
}

/** Human label for a verification method. */
export function attestationMethodLabel(method: string | undefined): string | undefined {
  if (method === "sigstore-keyless") return "Sigstore keyless (OIDC certificate)";
  if (method === "sigstore-key") return "Sigstore bundle signed with a configured key";
  return method;
}

/**
 * A copy of the metadata with the (large) Sigstore bundle replaced by a
 * placeholder, for the raw metadata view: the bundle otherwise fills it.
 */
export function withoutAttestationBundle(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  if (!("attestation" in metadata)) return metadata;
  return { ...metadata, attestation: "<Sigstore bundle: see Attestation>" };
}
