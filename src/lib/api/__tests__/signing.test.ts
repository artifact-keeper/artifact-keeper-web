import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../fetch", () => ({ assertData: <T,>(d: T) => d }));
vi.mock("@/lib/sdk-client", () => ({}));

const m = {
  listKeys: vi.fn(),
  createKey: vi.fn(),
  getKey: vi.fn(),
  deleteKey: vi.fn(),
  revokeKey: vi.fn(),
  rotateKey: vi.fn(),
  getPublicKey: vi.fn(),
  getRepoSigningConfig: vi.fn(),
  updateRepoSigningConfig: vi.fn(),
  getRepoPublicKey: vi.fn(),
};
vi.mock("@artifact-keeper/sdk", () => ({
  listKeys: (...a: unknown[]) => m.listKeys(...a),
  createKey: (...a: unknown[]) => m.createKey(...a),
  getKey: (...a: unknown[]) => m.getKey(...a),
  deleteKey: (...a: unknown[]) => m.deleteKey(...a),
  revokeKey: (...a: unknown[]) => m.revokeKey(...a),
  rotateKey: (...a: unknown[]) => m.rotateKey(...a),
  getPublicKey: (...a: unknown[]) => m.getPublicKey(...a),
  getRepoSigningConfig: (...a: unknown[]) => m.getRepoSigningConfig(...a),
  updateRepoSigningConfig: (...a: unknown[]) => m.updateRepoSigningConfig(...a),
  getRepoPublicKey: (...a: unknown[]) => m.getRepoPublicKey(...a),
}));

import signingApi from "../signing";

const SDK_KEY = {
  id: "k1",
  name: "release",
  key_type: "gpg",
  algorithm: "ed25519",
  fingerprint: "AB12",
  key_id: null,
  public_key_pem: "-----BEGIN-----",
  is_active: true,
  uid_name: null,
  uid_email: undefined,
  expires_at: null,
  last_used_at: null,
  repository_id: null,
  created_at: "2026-06-01T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("signingApi", () => {
  it("listKeys maps KeyListResponse.keys to SigningKey[] (nullish normalized)", async () => {
    m.listKeys.mockResolvedValue({ data: { keys: [SDK_KEY], total: 1 }, error: undefined });
    const out = await signingApi.listKeys();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "k1", key_type: "gpg", uid_email: null, fingerprint: "AB12" });
  });

  it("listKeys throws on error", async () => {
    m.listKeys.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(signingApi.listKeys()).rejects.toEqual({ status: 500 });
  });

  it("createKey posts the request body and returns the key", async () => {
    m.createKey.mockResolvedValue({ data: SDK_KEY, error: undefined });
    const out = await signingApi.createKey({ name: "release", key_type: "gpg" });
    expect(m.createKey).toHaveBeenCalledWith({ body: { name: "release", key_type: "gpg" } });
    expect(out.name).toBe("release");
  });

  it("getKey passes the key_id path param", async () => {
    m.getKey.mockResolvedValue({ data: SDK_KEY, error: undefined });
    await signingApi.getKey("k1");
    expect(m.getKey).toHaveBeenCalledWith({ path: { key_id: "k1" } });
  });

  it("rotateKey returns the new key", async () => {
    m.rotateKey.mockResolvedValue({ data: { ...SDK_KEY, id: "k2" }, error: undefined });
    const out = await signingApi.rotateKey("k1");
    expect(m.rotateKey).toHaveBeenCalledWith({ path: { key_id: "k1" } });
    expect(out.id).toBe("k2");
  });

  it("deleteKey and revokeKey resolve void and pass key_id", async () => {
    m.deleteKey.mockResolvedValue({ error: undefined });
    m.revokeKey.mockResolvedValue({ error: undefined });
    await expect(signingApi.deleteKey("k1")).resolves.toBeUndefined();
    await expect(signingApi.revokeKey("k1")).resolves.toBeUndefined();
    expect(m.deleteKey).toHaveBeenCalledWith({ path: { key_id: "k1" } });
    expect(m.revokeKey).toHaveBeenCalledWith({ path: { key_id: "k1" } });
  });

  it("revokeKey throws on error", async () => {
    m.revokeKey.mockResolvedValue({ error: { status: 404 } });
    await expect(signingApi.revokeKey("x")).rejects.toEqual({ status: 404 });
  });

  it("getPublicKeyPem returns the PEM string", async () => {
    m.getPublicKey.mockResolvedValue({ data: "-----PEM-----", error: undefined });
    expect(await signingApi.getPublicKeyPem("k1")).toBe("-----PEM-----");
  });

  it("getRepoConfig adapts the config incl. resolved key", async () => {
    m.getRepoSigningConfig.mockResolvedValue({
      data: {
        repository_id: "r1",
        require_signatures: true,
        sign_metadata: false,
        sign_packages: true,
        signing_key_id: "k1",
        key: SDK_KEY,
      },
      error: undefined,
    });
    const out = await signingApi.getRepoConfig("r1");
    expect(out).toMatchObject({ repository_id: "r1", require_signatures: true });
    expect(out.key?.id).toBe("k1");
  });

  it("updateRepoConfig posts body and maps RepositorySigningConfig (key=null)", async () => {
    m.updateRepoSigningConfig.mockResolvedValue({
      data: {
        id: "cfg1",
        repository_id: "r1",
        require_signatures: false,
        sign_metadata: true,
        sign_packages: false,
        signing_key_id: null,
        created_at: "x",
        updated_at: "y",
      },
      error: undefined,
    });
    const out = await signingApi.updateRepoConfig("r1", { require_signatures: false });
    expect(m.updateRepoSigningConfig).toHaveBeenCalledWith({
      path: { repo_id: "r1" },
      body: { require_signatures: false },
    });
    expect(out.key).toBeNull();
    expect(out.sign_metadata).toBe(true);
  });

  it("getRepoPublicKeyPem returns the PEM string", async () => {
    m.getRepoPublicKey.mockResolvedValue({ data: "-----REPO PEM-----", error: undefined });
    expect(await signingApi.getRepoPublicKeyPem("r1")).toBe("-----REPO PEM-----");
  });
});
