import { describe, it, expect } from "vitest";
import { narrowStorageBackend, storageBackendLabel } from "../storage-backend";

describe("narrowStorageBackend (#918)", () => {
  it.each(["filesystem", "s3", "azure", "gcs"])("recognises %s", (value) => {
    expect(narrowStorageBackend(value)).toEqual({ known: true, value });
  });

  it("keeps an unrecognised string raw", () => {
    expect(narrowStorageBackend("s3-primary")).toEqual({ known: false, value: "s3-primary" });
  });

  it.each([undefined, null, "", "   ", 42, {}])("returns undefined for %p", (raw) => {
    expect(narrowStorageBackend(raw)).toBeUndefined();
  });
});

describe("storageBackendLabel (#918)", () => {
  it("maps known backends to human labels", () => {
    expect(storageBackendLabel({ known: true, value: "filesystem" })).toBe("Filesystem");
    expect(storageBackendLabel({ known: true, value: "s3" })).toBe("S3");
    expect(storageBackendLabel({ known: true, value: "azure" })).toBe("Azure Blob");
    expect(storageBackendLabel({ known: true, value: "gcs" })).toBe("GCS");
  });

  it("falls back to the raw value", () => {
    expect(storageBackendLabel({ known: false, value: "minio-legacy" })).toBe("minio-legacy");
  });
});
