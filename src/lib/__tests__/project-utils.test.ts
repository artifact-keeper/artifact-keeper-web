import { describe, it, expect } from "vitest";
import { quotaInputToBytes, bytesToQuotaInput, formatQuota } from "../project-utils";

describe("project quota helpers", () => {
  it("converts form input to bytes", () => {
    expect(quotaInputToBytes("5", "GB")).toBe(5 * 1024 ** 3);
    expect(quotaInputToBytes("1.5", "MB")).toBe(Math.round(1.5 * 1024 ** 2));
  });

  it("treats empty, zero and invalid input as unlimited", () => {
    expect(quotaInputToBytes("", "GB")).toBeUndefined();
    expect(quotaInputToBytes("0", "GB")).toBeUndefined();
    expect(quotaInputToBytes("-3", "GB")).toBeUndefined();
    expect(quotaInputToBytes("abc", "GB")).toBeUndefined();
  });

  it("round-trips stored bytes into the largest sensible unit", () => {
    expect(bytesToQuotaInput(5 * 1024 ** 3)).toEqual({ value: "5", unit: "GB" });
    expect(bytesToQuotaInput(2 * 1024 ** 4)).toEqual({ value: "2", unit: "TB" });
    expect(bytesToQuotaInput(512 * 1024 ** 2)).toEqual({ value: "512", unit: "MB" });
    expect(bytesToQuotaInput(undefined)).toEqual({ value: "", unit: "GB" });
  });

  it("formats an unset quota as Unlimited", () => {
    expect(formatQuota(undefined)).toBe("Unlimited");
    expect(formatQuota(1024 ** 3)).toContain("GB");
  });
});
