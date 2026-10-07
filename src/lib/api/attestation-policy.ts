import { apiFetch } from '@/lib/api/fetch';

/**
 * The registry's attestation trust policy (backend 1.11.0,
 * `GET /api/v1/attestations/policy`): whether uploads must carry a verified
 * attestation, which OIDC issuers and certificate identities are trusted for
 * keyless Sigstore bundles, and which public keys are trusted for key-signed
 * bundles. Read-only here; the policy is set in server configuration. Not in
 * the generated SDK yet, so it goes through `apiFetch`.
 */
export interface AttestationTrustKey {
  id: string;
  name?: string;
  fingerprint?: string;
  algorithm?: string;
}

export interface AttestationTrustPolicy {
  require_verified: boolean;
  issuers: string[];
  identities: string[];
  keys: AttestationTrustKey[];
}

type Obj = Record<string, unknown>;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function adaptAttestationPolicy(raw: unknown): AttestationTrustPolicy {
  const r: Obj = typeof raw === 'object' && raw !== null ? (raw as Obj) : {};
  const keys: AttestationTrustKey[] = [];
  for (const k of Array.isArray(r.keys) ? r.keys : []) {
    if (typeof k !== 'object' || k === null) continue;
    const o = k as Obj;
    const id = str(o.id) ?? str(o.fingerprint);
    if (!id) continue;
    keys.push({ id, name: str(o.name), fingerprint: str(o.fingerprint), algorithm: str(o.algorithm) });
  }
  return {
    // Fail-safe display: only an explicit `false` reads as "not required".
    require_verified: r.require_verified !== false,
    issuers: strings(r.issuers),
    identities: strings(r.identities),
    keys,
  };
}

export const attestationPolicyApi = {
  get: async (): Promise<AttestationTrustPolicy> =>
    adaptAttestationPolicy(await apiFetch<unknown>('/api/v1/attestations/policy')),
};
