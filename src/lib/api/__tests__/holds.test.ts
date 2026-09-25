import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockRelease = vi.fn();
const mockReject = vi.fn();
vi.mock("../quarantine", () => ({
  quarantineApi: {
    release: (...args: unknown[]) => mockRelease(...args),
    reject: (...args: unknown[]) => mockReject(...args),
  },
}));

import {
  holdsApi,
  formatHoldRemaining,
  formatDurationSeconds,
  joinHoldKinds,
} from "../holds";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("holdsApi.summary", () => {
  it("adapts snake_case counts", async () => {
    mockApiFetch.mockResolvedValue({
      age_gate_pending: 2,
      quarantine_active: 3,
      quarantine_rejected: 1,
      policy_blocked: 4,
    });

    const summary = await holdsApi.summary();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/holds/summary");
    expect(summary).toEqual({
      ageGatePending: 2,
      quarantineActive: 3,
      quarantineRejected: 1,
      policyBlocked: 4,
    });
  });
});

describe("holdsApi.listQuarantine", () => {
  it("sends kind and per_page and adapts rows", async () => {
    mockApiFetch.mockResolvedValue({
      items: [
        {
          artifact_id: "a1",
          name: "leftpad",
          version: "1.0.0",
          repository_key: "npm-local",
          repository_format: "npm",
          quarantine_status: "quarantined",
          kind: "active",
          quarantine_until: "2026-09-17T00:00:00Z",
          remaining_seconds: 3600,
          quarantine_reason: "upload hold",
          created_at: "2026-09-16T00:00:00Z",
          is_blocked: true,
        },
      ],
      pagination: { total: 1 },
    });

    const page = await holdsApi.listQuarantine({
      kinds: ["active", "rejected"],
      perPage: 100,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/holds/quarantine?kind=active%2Crejected&per_page=100",
    );
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      artifactId: "a1",
      name: "leftpad",
      kind: "active",
      remainingSeconds: 3600,
      isBlocked: true,
    });
  });

  it("falls unknown kinds back to active", async () => {
    mockApiFetch.mockResolvedValue({
      items: [
        {
          artifact_id: "a2",
          name: "x",
          version: null,
          repository_key: "generic",
          repository_format: "generic",
          quarantine_status: "quarantined",
          kind: "mystery",
          quarantine_until: null,
          remaining_seconds: null,
          quarantine_reason: null,
          created_at: "2026-09-16T00:00:00Z",
          is_blocked: true,
        },
      ],
      pagination: { total: 1 },
    });

    const page = await holdsApi.listQuarantine();
    expect(page.items[0].kind).toBe("active");
  });
});

describe("holdsApi.listPolicyBlocks", () => {
  it("adapts hosted severity counts", async () => {
    mockApiFetch.mockResolvedValue({
      items: [
        {
          id: "art-1",
          source: "hosted",
          artifact_id: "art-1",
          package_name: "log4j-core",
          package_version: "2.14.1",
          path: "org/apache/logging/log4j/log4j-core/2.14.1/log4j-core-2.14.1.jar",
          repository_key: "maven-releases",
          repository_format: "maven",
          uploaded_at: "2026-01-02T00:00:00Z",
          critical_count: 2,
          high_count: 3,
          medium_count: 1,
          low_count: 0,
          findings_count: 6,
          max_severity: "high",
          policy_name: "block-high",
          block_reason: "Policy 'block-high': 5 findings at or above high",
        },
      ],
      pagination: { total: 1 },
    });

    const page = await holdsApi.listPolicyBlocks({ perPage: 100 });
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/holds/policy-blocks?per_page=100",
    );
    expect(page.items[0]).toMatchObject({
      packageName: "log4j-core",
      criticalCount: 2,
      highCount: 3,
      mediumCount: 1,
      policyName: "block-high",
      source: "hosted",
    });
  });
});

describe("holdsApi.release / reject", () => {
  it("delegates to quarantineApi", async () => {
    mockRelease.mockResolvedValue({ artifact_id: "a1", new_status: "released", message: "ok" });
    mockReject.mockResolvedValue({ artifact_id: "a1", new_status: "rejected", message: "ok" });

    await holdsApi.release("a1");
    await holdsApi.reject("a1", "malware");

    expect(mockRelease).toHaveBeenCalledWith("a1");
    expect(mockReject).toHaveBeenCalledWith("a1", "malware");
  });
});

describe("formatDurationSeconds", () => {
  it("picks the coarsest useful unit", () => {
    expect(formatDurationSeconds(12)).toBe("12s");
    expect(formatDurationSeconds(90)).toBe("1m");
    expect(formatDurationSeconds(3600)).toBe("1h");
    expect(formatDurationSeconds(3660)).toBe("1h 1m");
    expect(formatDurationSeconds(86_400)).toBe("1d");
    expect(formatDurationSeconds(90_000)).toBe("1d 1h");
  });
});

describe("formatHoldRemaining", () => {
  it("labels rejected, expired, permanent, and timed holds", () => {
    expect(formatHoldRemaining({ kind: "rejected", remainingSeconds: null })).toBe(
      "Permanent block",
    );
    expect(formatHoldRemaining({ kind: "expired", remainingSeconds: -10 })).toBe(
      "Expired — downloads allowed",
    );
    expect(formatHoldRemaining({ kind: "active", remainingSeconds: null })).toBe(
      "Until released",
    );
    expect(formatHoldRemaining({ kind: "active", remainingSeconds: 120 })).toBe(
      "2m remaining",
    );
    expect(formatHoldRemaining({ kind: "active", remainingSeconds: 120 }, 120)).toBe(
      "Expired — downloads allowed",
    );
  });
});

describe("joinHoldKinds", () => {
  it("joins with or", () => {
    expect(joinHoldKinds([])).toBe("");
    expect(joinHoldKinds(["active"])).toBe("active");
    expect(joinHoldKinds(["active", "rejected"])).toBe("active or rejected");
    expect(joinHoldKinds(["active", "expired", "rejected"])).toBe(
      "active, expired or rejected",
    );
  });
});
