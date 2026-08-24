// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SILENT_SSO_ATTEMPTED_KEY,
  SILENT_SSO_PREFLIGHT_TIMEOUT_MS,
  SILENT_SSO_RETURN_KEY,
  buildSilentLoginUrl,
  clearSilentSsoAttempt,
  consumeSilentSsoReturnTo,
  hasAttemptedSilentSso,
  isSilentSsoExcludedPath,
  markSilentSsoAttempted,
  preflightSilentLogin,
  startSilentSignIn,
  storeSilentSsoReturnTo,
} from "../silent-sso";

describe("session guard", () => {
  beforeEach(() => sessionStorage.clear());

  it("records exactly one attempt per session", () => {
    expect(hasAttemptedSilentSso()).toBe(false);
    markSilentSsoAttempted();
    expect(hasAttemptedSilentSso()).toBe(true);
    expect(sessionStorage.getItem(SILENT_SSO_ATTEMPTED_KEY)).toBe("1");
  });

  it("clears on demand (sign-in / sign-out reset)", () => {
    markSilentSsoAttempted();
    clearSilentSsoAttempt();
    expect(hasAttemptedSilentSso()).toBe(false);
  });

  it("fails closed (reads as attempted) and never throws when sessionStorage is unavailable", () => {
    // Privacy modes throw on the accessor itself. A browser where the
    // attempt cannot be recorded must never loop the probe, and none of the
    // helpers may surface the exception.
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    try {
      expect(hasAttemptedSilentSso()).toBe(true);
      expect(() => markSilentSsoAttempted()).not.toThrow();
      expect(() => clearSilentSsoAttempt()).not.toThrow();
      expect(() => storeSilentSsoReturnTo("/x")).not.toThrow();
      expect(consumeSilentSsoReturnTo()).toBeNull();
    } finally {
      if (original) {
        Object.defineProperty(window, "sessionStorage", original);
      }
    }
  });
});

describe("buildSilentLoginUrl", () => {
  it("appends prompt=none to a bare login URL", () => {
    expect(
      buildSilentLoginUrl("/api/v1/auth/sso/oidc/abc/login"),
    ).toBe("/api/v1/auth/sso/oidc/abc/login?prompt=none");
  });

  it("appends with & when the URL already has a query", () => {
    expect(buildSilentLoginUrl("/login?x=1")).toBe("/login?x=1&prompt=none");
  });
});

describe("return-to round trip", () => {
  beforeEach(() => sessionStorage.clear());

  it("stores and consumes (read-once) a same-app path", () => {
    storeSilentSsoReturnTo("/packages/pypi/requests?tab=files#top");
    expect(consumeSilentSsoReturnTo()).toBe("/packages/pypi/requests?tab=files#top");
    expect(consumeSilentSsoReturnTo()).toBeNull();
    expect(sessionStorage.getItem(SILENT_SSO_RETURN_KEY)).toBeNull();
  });

  it("rejects values that could be an open redirect", () => {
    for (const bad of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", ""]) {
      sessionStorage.setItem(SILENT_SSO_RETURN_KEY, bad);
      expect(consumeSilentSsoReturnTo(), bad).toBeNull();
    }
  });
});

describe("isSilentSsoExcludedPath", () => {
  it("excludes the auth-flow pages", () => {
    for (const p of [
      "/callback",
      "/auth/callback",
      "/login",
      "/change-password",
    ]) {
      expect(isSilentSsoExcludedPath(p)).toBe(true);
    }
  });

  it("allows ordinary app pages (anonymous browsing surfaces)", () => {
    for (const p of ["/", "/repositories", "/packages/pypi/requests", "/loginish"]) {
      expect(isSilentSsoExcludedPath(p)).toBe(false);
    }
  });
});

describe("preflightSilentLogin (the fail-open gate)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes on an opaqueredirect (redirect:manual view of the 307)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ type: "opaqueredirect", status: 0 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(preflightSilentLogin("/api/v1/auth/sso/oidc/p1/login")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/sso/oidc/p1/login?prompt=none");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails open on a backend error status (IdP discovery failed server-side)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "basic", status: 500 }));
    await expect(preflightSilentLogin("/x")).resolves.toBe(false);
  });

  it("fails open on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    await expect(preflightSilentLogin("/x")).resolves.toBe(false);
  });

  it("fails open on timeout (a hung backend/IdP never strands the visitor)", async () => {
    vi.useFakeTimers();
    try {
      // fetch that honors the abort signal but never resolves on its own.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () =>
                reject(new DOMException("timeout", "TimeoutError")),
              );
            }),
        ),
      );
      const p = preflightSilentLogin("/x", 100);
      await vi.advanceTimersByTimeAsync(101);
      await expect(p).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("has a bounded default timeout", () => {
    expect(SILENT_SSO_PREFLIGHT_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });
});

describe("startSilentSignIn", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("navigates top-level to the prompt=none URL after a passing preflight, remembering the location", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "opaqueredirect", status: 0 }));
    const navigate = vi.fn();
    await expect(
      startSilentSignIn("/api/v1/auth/sso/oidc/p1/login", { navigate }),
    ).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith("/api/v1/auth/sso/oidc/p1/login?prompt=none");
    // jsdom's default location is "/", which is what the callback restores.
    expect(sessionStorage.getItem(SILENT_SSO_RETURN_KEY)).toBe("/");
  });

  it("does NOT navigate when the preflight fails (fail open)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "basic", status: 502 }));
    const navigate = vi.fn();
    await expect(startSilentSignIn("/x", { navigate })).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SILENT_SSO_RETURN_KEY)).toBeNull();
  });
});
