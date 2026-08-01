import { describe, it, expect } from "vitest";
import { unwrap } from "../sdk-utils";

describe("unwrap", () => {
  it("returns data on success", async () => {
    const result = Promise.resolve({
      data: { id: "123", name: "repo" },
      error: undefined,
    });
    await expect(unwrap(result)).resolves.toEqual({ id: "123", name: "repo" });
  });

  it("returns falsy-but-valid data unchanged", async () => {
    await expect(unwrap(Promise.resolve({ data: 0, error: undefined }))).resolves.toBe(0);
    await expect(unwrap(Promise.resolve({ data: false, error: undefined }))).resolves.toBe(false);
    await expect(unwrap(Promise.resolve({ data: [], error: undefined }))).resolves.toEqual([]);
  });

  it("returns undefined data for void (204-style) responses", async () => {
    await expect(
      unwrap(Promise.resolve({ data: undefined, error: undefined })),
    ).resolves.toBeUndefined();
  });

  it("throws an SDK error object with an .error string", async () => {
    const sdkError = { error: "Repository not found" };
    await expect(
      unwrap(Promise.resolve({ data: undefined, error: sdkError })),
    ).rejects.toBe(sdkError);
  });

  it("throws an SDK error object with a .message string", async () => {
    const sdkError = { message: "validation failed", status: 422 };
    await expect(
      unwrap(Promise.resolve({ data: undefined, error: sdkError })),
    ).rejects.toBe(sdkError);
  });

  it("throws a wrapped HTTP error object ({ body: { message } })", async () => {
    const sdkError = { status: 500, body: { message: "boom" } };
    await expect(
      unwrap(Promise.resolve({ data: undefined, error: sdkError })),
    ).rejects.toBe(sdkError);
  });

  it("throws a plain string error", async () => {
    await expect(
      unwrap(Promise.resolve({ data: undefined, error: "unauthorized" })),
    ).rejects.toBe("unauthorized");
  });

  it("propagates a rejected promise from the SDK call itself", async () => {
    const failure = new Error("network down");
    await expect(unwrap(Promise.reject(failure))).rejects.toBe(failure);
  });
});
