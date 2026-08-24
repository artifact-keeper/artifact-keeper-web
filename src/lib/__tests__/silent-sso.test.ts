// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SILENT_SSO_ATTEMPTED_KEY,
  SILENT_SSO_MESSAGE_TYPE,
  SILENT_SSO_TIMEOUT_MS,
  buildSilentLoginUrl,
  clearSilentSsoAttempt,
  hasAttemptedSilentSso,
  isInIframe,
  isSilentSsoExcludedPath,
  isSilentSsoMessage,
  markSilentSsoAttempted,
  postSilentSsoResult,
  runSilentSso,
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
    // Privacy modes / storage-partitioned iframes throw on the accessor
    // itself. A browser where the attempt cannot be recorded must never loop
    // the probe, and none of the helpers may surface the exception.
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

describe("isSilentSsoMessage", () => {
  it("accepts the three probe outcomes", () => {
    for (const outcome of ["success", "denied", "error"]) {
      expect(
        isSilentSsoMessage({ type: SILENT_SSO_MESSAGE_TYPE, outcome }),
      ).toBe(true);
    }
  });

  it("rejects anything else (untrusted postMessage traffic)", () => {
    expect(isSilentSsoMessage(null)).toBe(false);
    expect(isSilentSsoMessage("ak-silent-sso-result")).toBe(false);
    expect(isSilentSsoMessage({ type: "other", outcome: "success" })).toBe(
      false,
    );
    expect(
      isSilentSsoMessage({ type: SILENT_SSO_MESSAGE_TYPE, outcome: "timeout" }),
    ).toBe(false);
    expect(
      isSilentSsoMessage({ type: SILENT_SSO_MESSAGE_TYPE }),
    ).toBe(false);
  });
});

describe("isInIframe", () => {
  it("is false when self === top", () => {
    const w = { self: window, top: window };
    expect(isInIframe(w)).toBe(false);
  });

  it("is true when self !== top", () => {
    const w = { self: window, top: {} as Window };
    expect(isInIframe(w)).toBe(true);
  });

  it("is true when touching top throws (cross-origin ancestor)", () => {
    const w = {
      self: window,
      get top(): Window {
        throw new Error("cross-origin");
      },
    };
    expect(isInIframe(w)).toBe(true);
  });
});

describe("runSilentSso", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document
      .querySelectorAll("iframe")
      .forEach((f) => f.remove());
  });

  function mountedIframe(): HTMLIFrameElement {
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    return iframe as HTMLIFrameElement;
  }

  /**
   * Deliver a message event as if it came from the probe iframe. jsdom fires
   * listeners synchronously.
   */
  function deliver(data: unknown, opts?: { origin?: string; source?: unknown }) {
    const iframe = mountedIframe();
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: opts?.origin ?? window.location.origin,
        source: (opts && "source" in opts
          ? opts.source
          : iframe.contentWindow) as Window,
      }),
    );
  }

  it("mounts a hidden sandboxed iframe pointed at the silent login URL", async () => {
    const promise = runSilentSso("/api/v1/auth/sso/oidc/p1/login");
    const iframe = mountedIframe();
    expect(iframe.src).toContain("/api/v1/auth/sso/oidc/p1/login?prompt=none");
    expect(iframe.style.display).toBe("none");
    expect(iframe.getAttribute("aria-hidden")).toBe("true");
    expect(iframe.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin",
    );
    deliver({ type: SILENT_SSO_MESSAGE_TYPE, outcome: "denied" });
    await expect(promise).resolves.toBe("denied");
  });

  it("resolves success when the callback page reports it", async () => {
    const promise = runSilentSso("/login-url");
    deliver({ type: SILENT_SSO_MESSAGE_TYPE, outcome: "success" });
    await expect(promise).resolves.toBe("success");
    // Teardown happens on the next tick.
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("resolves timeout (fail open) when no result arrives", async () => {
    // The IdP being down or unreachable must cost the anonymous visitor
    // nothing: the probe gives up quietly after the timeout.
    const promise = runSilentSso("/login-url");
    await vi.advanceTimersByTimeAsync(SILENT_SSO_TIMEOUT_MS + 1);
    await expect(promise).resolves.toBe("timeout");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("honors a custom timeout", async () => {
    const promise = runSilentSso("/login-url", 100);
    await vi.advanceTimersByTimeAsync(101);
    await expect(promise).resolves.toBe("timeout");
  });

  it("ignores messages from other origins", async () => {
    const promise = runSilentSso("/login-url", 50);
    deliver(
      { type: SILENT_SSO_MESSAGE_TYPE, outcome: "success" },
      { origin: "https://evil.example" },
    );
    await vi.advanceTimersByTimeAsync(51);
    await expect(promise).resolves.toBe("timeout");
  });

  it("ignores same-origin messages that are not from the probe iframe", async () => {
    const promise = runSilentSso("/login-url", 50);
    deliver(
      { type: SILENT_SSO_MESSAGE_TYPE, outcome: "success" },
      { source: null },
    );
    await vi.advanceTimersByTimeAsync(51);
    await expect(promise).resolves.toBe("timeout");
  });

  it("ignores unrelated message payloads", async () => {
    const promise = runSilentSso("/login-url", 50);
    deliver({ hello: "world" });
    deliver("string message");
    await vi.advanceTimersByTimeAsync(51);
    await expect(promise).resolves.toBe("timeout");
  });

  it("settles only once (first result wins)", async () => {
    const promise = runSilentSso("/login-url");
    deliver({ type: SILENT_SSO_MESSAGE_TYPE, outcome: "denied" });
    deliver({ type: SILENT_SSO_MESSAGE_TYPE, outcome: "success" });
    await expect(promise).resolves.toBe("denied");
  });
});

describe("postSilentSsoResult", () => {
  it("posts the typed message to the parent window, origin-pinned", () => {
    const spy = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    postSilentSsoResult("denied");
    expect(spy).toHaveBeenCalledWith(
      { type: SILENT_SSO_MESSAGE_TYPE, outcome: "denied" },
      window.location.origin,
    );
    spy.mockRestore();
  });

  it("swallows a failed post (parent gone) — fail open", () => {
    const spy = vi
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => {
        throw new Error("detached");
      });
    expect(() => postSilentSsoResult("error")).not.toThrow();
    spy.mockRestore();
  });
});
