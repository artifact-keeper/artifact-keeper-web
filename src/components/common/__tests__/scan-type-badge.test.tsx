// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
    className,
    ...props
  }: React.ComponentProps<"span">) => (
    <span className={className} {...props}>
      {children}
    </span>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import {
  ScanTypeBadge,
  SCAN_TYPES,
  EXTERNAL_SCAN_TYPE,
  scanTypeLabel,
  scanTypeIcon,
} from "../scan-type-badge";

describe("SCAN_TYPES (#858)", () => {
  it("mirrors the backend's KNOWN_SCAN_TYPES vocabulary", () => {
    // artifact-keeper#3410 — the set `?scan_type=` validates against. A value
    // missing here is a filter option the user cannot pick; a value that is
    // not in the backend set is a guaranteed 400.
    expect([...SCAN_TYPES]).toEqual([
      "dependency",
      "image",
      "license",
      "malware",
      "filesystem",
      "grype",
      "openscap",
      "incus",
      "external",
    ]);
  });

  it("includes the external scan type introduced by backend 1.10.0", () => {
    expect(SCAN_TYPES).toContain(EXTERNAL_SCAN_TYPE);
  });
});

describe("scanTypeLabel", () => {
  it("labels the external scan type", () => {
    expect(scanTypeLabel("external")).toBe("External");
  });

  it("expands terse backend values into readable labels", () => {
    expect(scanTypeLabel("image")).toBe("Container Image");
    expect(scanTypeLabel("dependency")).toBe("Dependency");
    expect(scanTypeLabel("license")).toBe("License");
    expect(scanTypeLabel("malware")).toBe("Malware");
    expect(scanTypeLabel("filesystem")).toBe("Filesystem");
    expect(scanTypeLabel("openscap")).toBe("OpenSCAP");
    expect(scanTypeLabel("incus")).toBe("Incus");
    expect(scanTypeLabel("grype")).toBe("Grype");
  });

  it("returns an unmodelled scan type unchanged rather than hiding it", () => {
    expect(scanTypeLabel("some-future-engine")).toBe("some-future-engine");
    expect(scanTypeLabel("")).toBe("");
  });
});

describe("scanTypeIcon", () => {
  it("returns a distinct icon per known scan type", () => {
    const icons = SCAN_TYPES.map((t) => scanTypeIcon(t));
    expect(new Set(icons).size).toBe(SCAN_TYPES.length);
  });

  it("falls back to a generic icon for an unknown scan type", () => {
    const fallback = scanTypeIcon("some-future-engine");
    expect(fallback).toBeDefined();
    expect(fallback).not.toBe(scanTypeIcon("external"));
    // Same fallback for every unknown value, so the column stays stable.
    expect(fallback).toBe(scanTypeIcon("another-future-engine"));
  });
});

describe("ScanTypeBadge", () => {
  afterEach(() => cleanup());

  it("renders the label for an external scan", () => {
    render(<ScanTypeBadge scanType="external" />);
    expect(screen.getByTestId("scan-type-badge")).toHaveTextContent("External");
  });

  it("renders an icon alongside the label", () => {
    const { container } = render(<ScanTypeBadge scanType="grype" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByTestId("scan-type-badge")).toHaveTextContent("Grype");
  });

  it("points the reader at the finding Source for external scans", () => {
    render(<ScanTypeBadge scanType="external" />);
    expect(screen.getByTestId("scan-type-badge").title).toMatch(/Source/);
  });

  it("names the scanner version in the tooltip when the backend sent one", () => {
    render(<ScanTypeBadge scanType="external" scannerVersion="acme-4.2" />);
    expect(screen.getByTestId("scan-type-badge").title).toContain("acme-4.2");
  });

  it("omits the scanner version from the tooltip when it is null", () => {
    render(<ScanTypeBadge scanType="grype" scannerVersion={null} />);
    expect(screen.getByTestId("scan-type-badge").title).toBe("Grype scan");
  });

  it("renders an unmodelled scan type verbatim", () => {
    render(<ScanTypeBadge scanType="some-future-engine" />);
    expect(screen.getByTestId("scan-type-badge")).toHaveTextContent(
      "some-future-engine",
    );
  });
});
