import { describe, it, expect } from "vitest";
import {
  isCacheOnly,
  isForcedByInstance,
  parseUpstreamMode,
  upstreamModeLabel,
} from "../upstream-mode";

const info = (upstream_mode: string, effective_upstream_mode: string) =>
  parseUpstreamMode({ repository_key: "r", upstream_mode, effective_upstream_mode });

describe("parseUpstreamMode", () => {
  it("keeps a complete response", () => {
    expect(info("online", "cache_only")).toEqual({
      repository_key: "r",
      upstream_mode: "online",
      effective_upstream_mode: "cache_only",
    });
  });

  it.each([null, undefined, "cache_only", 1, {}, { upstream_mode: "cache_only" }, { effective_upstream_mode: "cache_only" }])(
    "rejects %j",
    (raw) => {
      expect(parseUpstreamMode(raw)).toBeNull();
    },
  );

  it("rejects an unknown mode rather than guess", () => {
    expect(info("offline", "offline")).toBeNull();
    expect(info("online", "cache-only")).toBeNull();
  });
});

describe("isCacheOnly", () => {
  it("follows the effective mode, not the stored one", () => {
    expect(isCacheOnly(info("online", "cache_only"))).toBe(true);
    expect(isCacheOnly(info("cache_only", "cache_only"))).toBe(true);
    expect(isCacheOnly(info("online", "online"))).toBe(false);
    expect(isCacheOnly(null)).toBe(false);
    expect(isCacheOnly(undefined)).toBe(false);
  });
});

describe("isForcedByInstance", () => {
  it("is true only when the instance overrides an online repository", () => {
    expect(isForcedByInstance(info("online", "cache_only"))).toBe(true);
    expect(isForcedByInstance(info("cache_only", "cache_only"))).toBe(false);
    expect(isForcedByInstance(info("online", "online"))).toBe(false);
    expect(isForcedByInstance(null)).toBe(false);
  });
});

describe("upstreamModeLabel", () => {
  it("names both modes", () => {
    expect(upstreamModeLabel("cache_only")).toBe("Cache-only");
    expect(upstreamModeLabel("online")).toBe("Online");
  });
});
