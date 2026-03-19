import { describe, it, expect } from "vitest";
import { toUserMessage } from "../error-utils";

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

  // ---- 5. Wrapped HTTP errors: { body: { message | error } } ----

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

  it("prefers body.message over body.error", () => {
    expect(
      toUserMessage(
        { body: { message: "primary msg", error: "fallback msg" } },
        FALLBACK
      )
    ).toBe("primary msg");
  });

  it("falls back when body.message and body.error are both empty", () => {
    expect(
      toUserMessage({ body: { message: "", error: "" } }, FALLBACK)
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
});
