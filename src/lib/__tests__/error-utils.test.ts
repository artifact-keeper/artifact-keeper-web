import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  toUserMessage,
  isAccountLocked,
  isPasswordReuseError,
  mutationErrorToast,
  PASSWORD_REUSE_MESSAGE,
} from "../error-utils";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("toUserMessage", () => {
  const FALLBACK = "Something went wrong";

  // ---- 1. Standard Error instances ----

  it("extracts message from a standard Error", () => {
    expect(toUserMessage(new Error("Network timeout"), FALLBACK)).toBe(
      "Network timeout"
    );
  });

  it("extracts message from an Error subclass", () => {
    expect(toUserMessage(new TypeError("invalid type"), FALLBACK)).toBe(
      "invalid type"
    );
  });

  // ---- 2. Plain strings ----

  it("returns a non-empty string directly", () => {
    expect(toUserMessage("Disk full", FALLBACK)).toBe("Disk full");
  });

  it("falls back for an empty string", () => {
    expect(toUserMessage("", FALLBACK)).toBe(FALLBACK);
  });

  // ---- 3. SDK error objects with .error ----

  it("extracts .error string from an SDK error object", () => {
    expect(
      toUserMessage({ error: "Unauthorized" }, FALLBACK)
    ).toBe("Unauthorized");
  });

  it("falls back when .error is an empty string", () => {
    expect(toUserMessage({ error: "" }, FALLBACK)).toBe(FALLBACK);
  });

  // ---- 4. SDK objects with .message ----

  it("extracts .message string from an object", () => {
    expect(
      toUserMessage({ message: "Not found" }, FALLBACK)
    ).toBe("Not found");
  });

  it("falls back when .message is an empty string", () => {
    expect(toUserMessage({ message: "" }, FALLBACK)).toBe(FALLBACK);
  });

  // ---- 5a. FastAPI-style errors with .detail ----

  it("extracts .detail string from a FastAPI-style error", () => {
    expect(
      toUserMessage({ detail: "plugin requires npm 18+" }, FALLBACK)
    ).toBe("plugin requires npm 18+");
  });

  it("falls back when .detail is an empty string", () => {
    expect(toUserMessage({ detail: "" }, FALLBACK)).toBe(FALLBACK);
  });

  it("prefers .error over .detail when both are present", () => {
    expect(
      toUserMessage({ error: "from error", detail: "from detail" }, FALLBACK)
    ).toBe("from error");
  });

  // ---- 5b. Wrapped HTTP errors: { body: { message | error | detail } } ----

  it("extracts body.message from a wrapped HTTP error", () => {
    expect(
      toUserMessage({ body: { message: "Rate limit exceeded" } }, FALLBACK)
    ).toBe("Rate limit exceeded");
  });

  it("extracts body.error from a wrapped HTTP error", () => {
    expect(
      toUserMessage({ body: { error: "Internal Server Error" } }, FALLBACK)
    ).toBe("Internal Server Error");
  });

  it("extracts body.detail from a wrapped FastAPI error", () => {
    expect(
      toUserMessage({ body: { detail: "validation failed" } }, FALLBACK)
    ).toBe("validation failed");
  });

  it("prefers body.message over body.error and body.detail", () => {
    expect(
      toUserMessage(
        { body: { message: "primary", error: "secondary", detail: "tertiary" } },
        FALLBACK
      )
    ).toBe("primary");
  });

  it("falls back when body.message, body.error, and body.detail are all empty", () => {
    expect(
      toUserMessage({ body: { message: "", error: "", detail: "" } }, FALLBACK)
    ).toBe(FALLBACK);
  });

  it("falls back when body is an empty object", () => {
    expect(toUserMessage({ body: {} }, FALLBACK)).toBe(FALLBACK);
  });

  // ---- 6. Priority: .error takes precedence over .message ----

  it("prefers .error over .message on the same object", () => {
    expect(
      toUserMessage({ error: "err msg", message: "msg msg" }, FALLBACK)
    ).toBe("err msg");
  });

  // ---- 7. Fallback for unrecognized shapes ----

  it("returns fallback for null", () => {
    expect(toUserMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for undefined", () => {
    expect(toUserMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for a number", () => {
    expect(toUserMessage(42, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for a boolean", () => {
    expect(toUserMessage(true, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for an empty object", () => {
    expect(toUserMessage({}, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for an object with non-string .error", () => {
    expect(toUserMessage({ error: 123 }, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for an object with non-string .message", () => {
    expect(toUserMessage({ message: false }, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for an object with body that is not an object", () => {
    expect(toUserMessage({ body: "not-an-object" }, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for an array", () => {
    expect(toUserMessage(["something"], FALLBACK)).toBe(FALLBACK);
  });

  // ---- 8. HTTP status prefix on fallback (#355) ----
  // When the body has no useful message but the error carries an HTTP status,
  // prefix the fallback with "(HTTP <status>)" so a 409 Conflict reads
  // differently from a 500 Internal Server Error in toast text.

  it("prepends HTTP status to fallback when error.status is present", () => {
    expect(toUserMessage({ status: 500 }, FALLBACK)).toBe(`(HTTP 500) ${FALLBACK}`);
  });

  it("prepends HTTP status to fallback when error.statusCode is present", () => {
    expect(toUserMessage({ statusCode: 503 }, FALLBACK)).toBe(`(HTTP 503) ${FALLBACK}`);
  });

  it("prepends HTTP status to fallback when error.body.status is present", () => {
    expect(toUserMessage({ body: { status: 409 } }, FALLBACK)).toBe(`(HTTP 409) ${FALLBACK}`);
  });

  it("does NOT prepend status when backend gave a useful message", () => {
    // Even if status is present, prefer the backend's message verbatim.
    expect(
      toUserMessage({ status: 409, error: "Permission already exists" }, FALLBACK)
    ).toBe("Permission already exists");
  });

  it("does NOT prepend status to a plain string error", () => {
    // Plain strings already came from somewhere with context; don't decorate.
    expect(toUserMessage("Disk full", FALLBACK)).toBe("Disk full");
  });

  it("does NOT prepend status when status is non-numeric or out of range", () => {
    expect(toUserMessage({ status: "oops" }, FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage({ status: 99 }, FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage({ status: 600 }, FALLBACK)).toBe(FALLBACK);
  });

  it("does NOT prepend status for AbortError", () => {
    // AbortError has no useful HTTP status; treat as plain Error.
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    expect(toUserMessage(err, FALLBACK)).toBe("The operation was aborted.");
  });

  // ---- 9. Truncation of overlong messages (#356) ----
  // Backends can return 50KB stack traces or HTML 500 pages; rendering them
  // verbatim in a toast produces a wall of text. Cap at 240 characters with
  // an ellipsis + truncated-count suffix so the toast stays readable.

  it("returns short messages unchanged", () => {
    const short = "x".repeat(240);
    expect(toUserMessage(short, FALLBACK)).toBe(short);
  });

  it("truncates messages longer than the cap", () => {
    const long = "x".repeat(500);
    const out = toUserMessage(long, FALLBACK);
    expect(out.length).toBeLessThan(long.length);
    expect(out.endsWith("…")).toBe(true);
    // The truncated-count suffix carries the number of characters dropped.
    expect(out).toContain("260 more");
  });

  it("truncates a long Error.message", () => {
    const err = new Error("y".repeat(1000));
    const out = toUserMessage(err, FALLBACK);
    expect(out.length).toBeLessThan(1000);
    expect(out).toContain("…");
    expect(out).toContain("more");
  });

  it("truncates a long body.message but does not crash", () => {
    const huge = "z".repeat(50_000);
    const out = toUserMessage({ body: { message: huge } }, FALLBACK);
    // Cap is 240 + suffix; total length should be well under 320.
    expect(out.length).toBeLessThan(320);
    expect(out).toContain("…");
  });

  it("does NOT truncate the fallback string itself", () => {
    // The fallback labels are author-controlled; trust them.
    const longFallback = "Long deliberate fallback ".repeat(20);
    expect(toUserMessage(undefined, longFallback)).toBe(longFallback);
  });
});

describe("isAccountLocked", () => {
  // ---- Positive: backend error shapes ----

  it("detects lockout from object with .message", () => {
    expect(
      isAccountLocked({
        message: "Account temporarily locked due to too many failed login attempts",
      })
    ).toBe(true);
  });

  it("detects lockout from object with .error", () => {
    expect(
      isAccountLocked({
        error: "Account temporarily locked due to too many failed login attempts",
      })
    ).toBe(true);
  });

  it("detects lockout from a plain string", () => {
    expect(
      isAccountLocked("Account temporarily locked due to too many failed login attempts")
    ).toBe(true);
  });

  it("detects lockout from an Error instance", () => {
    expect(
      isAccountLocked(new Error("Account temporarily locked due to too many failed login attempts"))
    ).toBe(true);
  });

  it("detects lockout from wrapped HTTP error (body.message)", () => {
    expect(
      isAccountLocked({
        body: { message: "Account temporarily locked due to too many failed login attempts" },
      })
    ).toBe(true);
  });

  it("detects lockout from wrapped HTTP error (body.error)", () => {
    expect(
      isAccountLocked({
        body: { error: "Account temporarily locked" },
      })
    ).toBe(true);
  });

  it("detects lockout case-insensitively", () => {
    expect(isAccountLocked({ message: "ACCOUNT LOCKED" })).toBe(true);
  });

  it("detects lockout from a code field containing locked", () => {
    expect(isAccountLocked({ code: "ACCOUNT_LOCKED" })).toBe(true);
  });

  // ---- Negative: non-lockout errors ----

  it("returns false for a generic auth error", () => {
    expect(isAccountLocked({ message: "Invalid username or password" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isAccountLocked(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isAccountLocked(undefined)).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isAccountLocked({})).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isAccountLocked(42)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isAccountLocked("")).toBe(false);
  });

  it("returns false for an unrelated Error", () => {
    expect(isAccountLocked(new Error("Network timeout"))).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isAccountLocked(["locked"])).toBe(false);
  });

  it("returns false for 'Repository is locked for maintenance'", () => {
    expect(
      isAccountLocked({ message: "Repository is locked for maintenance" })
    ).toBe(false);
  });

  it("returns false for a plain string containing 'locked' without 'account'", () => {
    expect(isAccountLocked("Resource locked by another process")).toBe(false);
  });

  it("returns false for body.error containing 'locked' without 'account'", () => {
    expect(
      isAccountLocked({ body: { error: "File is locked" } })
    ).toBe(false);
  });
});

describe("isPasswordReuseError", () => {
  it("detects 'password history' in an Error message", () => {
    expect(
      isPasswordReuseError(new Error("Password matches password history"))
    ).toBe(true);
  });

  it("detects 'previously used' in an SDK error object", () => {
    expect(
      isPasswordReuseError({ error: "This password was previously used" })
    ).toBe(true);
  });

  it("detects 'recently used' in a plain string", () => {
    expect(isPasswordReuseError("Password was recently used")).toBe(true);
  });

  it("detects 'password reuse' in a body.message", () => {
    expect(
      isPasswordReuseError({
        body: { message: "password reuse is not allowed" },
      })
    ).toBe(true);
  });

  it("detects 'password was used' in a message field", () => {
    expect(
      isPasswordReuseError({ message: "This password was used before" })
    ).toBe(true);
  });

  it("detects 'already been used' in an error field", () => {
    expect(
      isPasswordReuseError({ error: "Password has already been used" })
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(
      isPasswordReuseError(new Error("PASSWORD HISTORY violation"))
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isPasswordReuseError(new Error("Invalid credentials"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPasswordReuseError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPasswordReuseError(undefined)).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isPasswordReuseError({})).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isPasswordReuseError("")).toBe(false);
  });
});

describe("PASSWORD_REUSE_MESSAGE", () => {
  it("is a non-empty string", () => {
    expect(typeof PASSWORD_REUSE_MESSAGE).toBe("string");
    expect(PASSWORD_REUSE_MESSAGE.length).toBeGreaterThan(0);
  });
});

describe("mutationErrorToast", () => {
  const errorMock = vi.mocked(toast.error);

  beforeEach(() => {
    errorMock.mockClear();
  });

  it("toasts the Error message when given a standard Error", () => {
    const handler = mutationErrorToast("Failed to do thing");
    handler(new Error("Network down"));
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith("Network down");
  });

  it("toasts the SDK .error string when given an SDK-shaped error", () => {
    const handler = mutationErrorToast("Failed to do thing");
    handler({ error: "Forbidden" });
    expect(errorMock).toHaveBeenCalledWith("Forbidden");
  });

  it("toasts the fallback label for an unrecognized error shape", () => {
    const handler = mutationErrorToast("Failed to delete repository");
    handler({ unrelated: 42 });
    expect(errorMock).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith("Failed to delete repository");
  });

  it("toasts the fallback label for null", () => {
    const handler = mutationErrorToast("Generic failure");
    handler(null);
    expect(errorMock).toHaveBeenCalledWith("Generic failure");
  });

  it("toasts the fallback label for undefined", () => {
    const handler = mutationErrorToast("Generic failure");
    handler(undefined);
    expect(errorMock).toHaveBeenCalledWith("Generic failure");
  });

  it("returns a reusable handler that does not produce closure side effects across calls", () => {
    const handler = mutationErrorToast("Fallback label");
    handler(new Error("first"));
    handler(new Error("second"));
    handler({ error: "third" });
    expect(errorMock).toHaveBeenCalledTimes(3);
    expect(errorMock).toHaveBeenNthCalledWith(1, "first");
    expect(errorMock).toHaveBeenNthCalledWith(2, "second");
    expect(errorMock).toHaveBeenNthCalledWith(3, "third");
  });

  it("each invocation creates an independent handler with its own label", () => {
    const handlerA = mutationErrorToast("Label A");
    const handlerB = mutationErrorToast("Label B");
    handlerA({});
    handlerB({});
    expect(errorMock).toHaveBeenNthCalledWith(1, "Label A");
    expect(errorMock).toHaveBeenNthCalledWith(2, "Label B");
  });
});
