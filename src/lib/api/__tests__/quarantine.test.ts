import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { quarantineApi } from "../quarantine";

const ARTIFACT_ID = "0f2f1c2e-1111-4222-8333-444455556666";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("quarantineApi.getStatus", () => {
  it("GETs the status endpoint for the artifact", async () => {
    mockApiFetch.mockResolvedValue({
      artifact_id: ARTIFACT_ID,
      quarantine_status: "quarantined",
      quarantine_until: "2026-08-01T00:00:00Z",
      quarantine_reason: "Policy: block-critical",
      is_blocked: true,
    });

    const status = await quarantineApi.getStatus(ARTIFACT_ID);

    expect(mockApiFetch).toHaveBeenCalledWith(`/api/v1/quarantine/${ARTIFACT_ID}`);
    expect(status.is_blocked).toBe(true);
    expect(status.quarantine_reason).toBe("Policy: block-critical");
  });

  it("keeps a redacted reason absent rather than inventing one", async () => {
    // The backend omits quarantine_reason when the caller cannot access the
    // repository. The status itself is still authoritative.
    mockApiFetch.mockResolvedValue({
      artifact_id: ARTIFACT_ID,
      quarantine_status: "quarantined",
      quarantine_until: null,
      is_blocked: true,
    });

    const status = await quarantineApi.getStatus(ARTIFACT_ID);

    expect(status.is_blocked).toBe(true);
    expect(status.quarantine_status).toBe("quarantined");
    expect(status.quarantine_reason).toBeUndefined();
  });

  it("percent-encodes the artifact id", async () => {
    mockApiFetch.mockResolvedValue({});
    await quarantineApi.getStatus("a/b");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/quarantine/a%2Fb");
  });
});

describe("quarantineApi.release", () => {
  it("POSTs an empty body to the release endpoint", async () => {
    mockApiFetch.mockResolvedValue({
      artifact_id: ARTIFACT_ID,
      new_status: "released",
      message: "Artifact released from quarantine",
    });

    const result = await quarantineApi.release(ARTIFACT_ID);

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/release`,
      { method: "POST", body: "{}" },
    );
    expect(result.new_status).toBe("released");
  });

  it("propagates a 403 from a non-admin caller", async () => {
    mockApiFetch.mockRejectedValue(new Error("API error 403: Admin access required"));
    await expect(quarantineApi.release(ARTIFACT_ID)).rejects.toThrow(/403/);
  });
});

describe("quarantineApi.reject", () => {
  it("POSTs the reason when one is given", async () => {
    mockApiFetch.mockResolvedValue({
      artifact_id: ARTIFACT_ID,
      new_status: "rejected",
      message: "Artifact rejected",
    });

    await quarantineApi.reject(ARTIFACT_ID, "Confirmed malware");

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/reject`,
      { method: "POST", body: JSON.stringify({ reason: "Confirmed malware" }) },
    );
  });

  it("sends an explicit null reason when none is given", async () => {
    // The reason is optional, but the handler deserializes the body with a
    // required JSON extractor, so the key has to be present.
    mockApiFetch.mockResolvedValue({});

    await quarantineApi.reject(ARTIFACT_ID);

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/reject`,
      { method: "POST", body: JSON.stringify({ reason: null }) },
    );
  });

  it("treats a blank reason as no reason", async () => {
    mockApiFetch.mockResolvedValue({});
    await quarantineApi.reject(ARTIFACT_ID, "   ");
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/reject`,
      { method: "POST", body: JSON.stringify({ reason: null }) },
    );
  });
});

describe("quarantineApi.quarantine", () => {
  it("POSTs the admin hold with an optional reason", async () => {
    mockApiFetch.mockResolvedValue({
      artifact_id: ARTIFACT_ID,
      new_status: "quarantined",
      message: "Artifact quarantined",
    });

    await quarantineApi.quarantine(ARTIFACT_ID, "Incident 4412");

    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/quarantine`,
      { method: "POST", body: JSON.stringify({ reason: "Incident 4412" }) },
    );
  });

  it("POSTs a null reason when none is given", async () => {
    mockApiFetch.mockResolvedValue({});
    await quarantineApi.quarantine(ARTIFACT_ID);
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/quarantine`,
      { method: "POST", body: JSON.stringify({ reason: null }) },
    );
  });
});

// #1238: bind each action to the OCI manifest digest the admin reviewed.
const HEX = "ab".repeat(32);
const DIGEST = `sha256:${HEX}`;

// Compat (#1238): expected_digest is sent whatever the backend version. Before
// 1.12.4, `/release` has no body extractor (the body is never read) and
// `/reject` and `/quarantine` deserialize it with `#[serde(default)]` and no
// `deny_unknown_fields` since 1.12.0, so an older 1.12.x backend ignores it
// and binds to the row as before; 1.12.4+ binds to the digest.
describe("expected_digest on the admin actions", () => {
  it("release sends expected_digest when given, and `{}` without it", async () => {
    mockApiFetch.mockResolvedValue({});
    await quarantineApi.release(ARTIFACT_ID, DIGEST);
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/release`,
      { method: "POST", body: JSON.stringify({ expected_digest: DIGEST }) },
    );
    await quarantineApi.release(ARTIFACT_ID, undefined);
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/release`,
      { method: "POST", body: "{}" },
    );
  });

  it("reject sends the reason and expected_digest", async () => {
    mockApiFetch.mockResolvedValue({});
    await quarantineApi.reject(ARTIFACT_ID, "bad", DIGEST);
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/reject`,
      { method: "POST", body: JSON.stringify({ reason: "bad", expected_digest: DIGEST }) },
    );
  });

  it("quarantine sends a null reason and expected_digest", async () => {
    mockApiFetch.mockResolvedValue({});
    await quarantineApi.quarantine(ARTIFACT_ID, undefined, DIGEST);
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/quarantine/${ARTIFACT_ID}/quarantine`,
      { method: "POST", body: JSON.stringify({ reason: null, expected_digest: DIGEST }) },
    );
  });

  it("passes held_digest / moved_to_digest through from the response", async () => {
    mockApiFetch.mockResolvedValue({
      artifact_id: ARTIFACT_ID,
      new_status: "released",
      message: "The tag moved",
      held_artifact_id: "11111111-1111-4111-8111-111111111111",
      held_digest: DIGEST,
      moved_to_digest: `sha256:${"cd".repeat(32)}`,
    });
    const r = await quarantineApi.release(ARTIFACT_ID, DIGEST);
    expect(r.held_digest).toBe(DIGEST);
    expect(r.moved_to_digest).toBe(`sha256:${"cd".repeat(32)}`);
  });
});
