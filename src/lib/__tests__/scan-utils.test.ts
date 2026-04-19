import { describe, it, expect } from "vitest";
import { isScanIncomplete, isScanFailed, isScanClean } from "../scan-utils";

describe("isScanIncomplete", () => {
  it("returns false for completed scans", () => {
    expect(isScanIncomplete("completed")).toBe(false);
  });

  it("returns true for failed scans", () => {
    expect(isScanIncomplete("failed")).toBe(true);
  });

  it("returns true for error scans", () => {
    expect(isScanIncomplete("error")).toBe(true);
  });

  it("returns true for pending scans", () => {
    expect(isScanIncomplete("pending")).toBe(true);
  });

  it("returns true for running scans", () => {
    expect(isScanIncomplete("running")).toBe(true);
  });

  it("returns true for unknown status values", () => {
    expect(isScanIncomplete("cancelled")).toBe(true);
    expect(isScanIncomplete("unknown")).toBe(true);
    expect(isScanIncomplete("")).toBe(true);
  });
});

describe("isScanFailed", () => {
  it("returns true for failed status", () => {
    expect(isScanFailed("failed")).toBe(true);
  });

  it("returns true for error status", () => {
    expect(isScanFailed("error")).toBe(true);
  });

  it("returns false for completed status", () => {
    expect(isScanFailed("completed")).toBe(false);
  });

  it("returns false for running status", () => {
    expect(isScanFailed("running")).toBe(false);
  });

  it("returns false for pending status", () => {
    expect(isScanFailed("pending")).toBe(false);
  });

  it("returns false for unknown status values", () => {
    expect(isScanFailed("cancelled")).toBe(false);
  });
});

describe("isScanClean", () => {
  it("returns true when completed with zero findings", () => {
    expect(isScanClean("completed", 0)).toBe(true);
  });

  it("returns false when completed with findings", () => {
    expect(isScanClean("completed", 5)).toBe(false);
  });

  it("returns false when failed with zero findings", () => {
    expect(isScanClean("failed", 0)).toBe(false);
  });

  it("returns false when running with zero findings", () => {
    expect(isScanClean("running", 0)).toBe(false);
  });

  it("returns false for unknown status even with zero findings", () => {
    expect(isScanClean("cancelled", 0)).toBe(false);
  });
});
