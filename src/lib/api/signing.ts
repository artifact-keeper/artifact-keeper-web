import '@/lib/sdk-client';
import {
  listKeys,
  createKey,
  getKey,
  deleteKey,
  revokeKey,
  rotateKey,
  getPublicKey,
  getRepoSigningConfig,
  updateRepoSigningConfig,
  getRepoPublicKey,
} from '@artifact-keeper/sdk';
import type {
  SigningKeyPublic,
  SigningConfigResponse,
  RepositorySigningConfig,
} from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

/** A signing key (public view — never carries private material). */
export interface SigningKey {
  id: string;
  name: string;
  /** `gpg` or `rsa`. */
  key_type: string;
  algorithm: string;
  fingerprint: string | null;
  key_id: string | null;
  public_key_pem: string;
  is_active: boolean;
  uid_name: string | null;
  uid_email: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  repository_id: string | null;
  created_at: string;
}

/** Per-repository signing configuration. */
export interface SigningConfig {
  repository_id: string;
  require_signatures: boolean;
  sign_metadata: boolean;
  sign_packages: boolean;
  signing_key_id: string | null;
  /** The resolved key (only returned by the GET config endpoint). */
  key: SigningKey | null;
}

export interface CreateSigningKeyRequest {
  name: string;
  key_type?: string;
  algorithm?: string;
  uid_name?: string;
  uid_email?: string;
  /** Scope the key to a single repository, or omit for an instance-wide key. */
  repository_id?: string;
}

export interface UpdateSigningConfigRequest {
  require_signatures?: boolean;
  sign_metadata?: boolean;
  sign_packages?: boolean;
  signing_key_id?: string | null;
}

function adaptKey(sdk: SigningKeyPublic): SigningKey {
  return {
    id: sdk.id,
    name: sdk.name,
    key_type: sdk.key_type,
    algorithm: sdk.algorithm,
    fingerprint: sdk.fingerprint ?? null,
    key_id: sdk.key_id ?? null,
    public_key_pem: sdk.public_key_pem,
    is_active: sdk.is_active,
    uid_name: sdk.uid_name ?? null,
    uid_email: sdk.uid_email ?? null,
    expires_at: sdk.expires_at ?? null,
    last_used_at: sdk.last_used_at ?? null,
    repository_id: sdk.repository_id ?? null,
    created_at: sdk.created_at,
  };
}

function adaptConfig(sdk: SigningConfigResponse): SigningConfig {
  return {
    repository_id: sdk.repository_id,
    require_signatures: sdk.require_signatures,
    sign_metadata: sdk.sign_metadata,
    sign_packages: sdk.sign_packages,
    signing_key_id: sdk.signing_key_id ?? null,
    key: sdk.key ? adaptKey(sdk.key) : null,
  };
}

// The update endpoint returns RepositorySigningConfig (no resolved `key`); the
// UI refetches the GET config to repaint the key, so map it to the same shape
// with a null key.
function adaptUpdatedConfig(sdk: RepositorySigningConfig): SigningConfig {
  return {
    repository_id: sdk.repository_id,
    require_signatures: sdk.require_signatures,
    sign_metadata: sdk.sign_metadata,
    sign_packages: sdk.sign_packages,
    signing_key_id: sdk.signing_key_id ?? null,
    key: null,
  };
}

const signingApi = {
  // --- instance / repo-scoped keys ---
  listKeys: async (): Promise<SigningKey[]> => {
    const { data, error } = await listKeys();
    if (error) throw error;
    return assertData(data, 'signingApi.listKeys').keys.map(adaptKey);
  },

  getKey: async (keyId: string): Promise<SigningKey> => {
    const { data, error } = await getKey({ path: { key_id: keyId } });
    if (error) throw error;
    return adaptKey(assertData(data, 'signingApi.getKey'));
  },

  createKey: async (req: CreateSigningKeyRequest): Promise<SigningKey> => {
    const { data, error } = await createKey({ body: req });
    if (error) throw error;
    return adaptKey(assertData(data, 'signingApi.createKey'));
  },

  deleteKey: async (keyId: string): Promise<void> => {
    const { error } = await deleteKey({ path: { key_id: keyId } });
    if (error) throw error;
  },

  revokeKey: async (keyId: string): Promise<void> => {
    const { error } = await revokeKey({ path: { key_id: keyId } });
    if (error) throw error;
  },

  /** Generate a fresh key that supersedes the old one; returns the new key. */
  rotateKey: async (keyId: string): Promise<SigningKey> => {
    const { data, error } = await rotateKey({ path: { key_id: keyId } });
    if (error) throw error;
    return adaptKey(assertData(data, 'signingApi.rotateKey'));
  },

  getPublicKeyPem: async (keyId: string): Promise<string> => {
    const { data, error } = await getPublicKey({ path: { key_id: keyId } });
    if (error) throw error;
    return assertData(data, 'signingApi.getPublicKeyPem');
  },

  // --- per-repository signing config ---
  getRepoConfig: async (repoId: string): Promise<SigningConfig> => {
    const { data, error } = await getRepoSigningConfig({ path: { repo_id: repoId } });
    if (error) throw error;
    return adaptConfig(assertData(data, 'signingApi.getRepoConfig'));
  },

  updateRepoConfig: async (
    repoId: string,
    req: UpdateSigningConfigRequest,
  ): Promise<SigningConfig> => {
    const { data, error } = await updateRepoSigningConfig({
      path: { repo_id: repoId },
      body: req,
    });
    if (error) throw error;
    return adaptUpdatedConfig(assertData(data, 'signingApi.updateRepoConfig'));
  },

  getRepoPublicKeyPem: async (repoId: string): Promise<string> => {
    const { data, error } = await getRepoPublicKey({ path: { repo_id: repoId } });
    if (error) throw error;
    return assertData(data, 'signingApi.getRepoPublicKeyPem');
  },
};

export default signingApi;
