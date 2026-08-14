import { describe, it, expect } from "vitest";

import {
  PROXY_SBOM_NOT_RECORDED_COPY,
  detectSbomFormat,
  formatHasProxySbom,
  formatSbomDocument,
  parseProxySbom,
  sbomLicenseSummary,
  unwrapSbomDocument,
} from "@/lib/proxy-sbom";

const CYCLONEDX = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  components: [
    {
      type: "library",
      name: "jinja2",
      version: "2.11.2",
      purl: "pkg:pypi/jinja2@2.11.2",
      licenses: [{ license: { id: "BSD-3-Clause" } }],
    },
    {
      type: "library",
      name: "markupsafe",
      version: "1.1.1",
      purl: "pkg:pypi/markupsafe@1.1.1",
      licenses: [{ expression: "BSD-3-Clause OR MIT" }],
    },
  ],
};

const SPDX = {
  spdxVersion: "SPDX-2.3",
  name: "left-pad",
  packages: [
    {
      name: "left-pad",
      versionInfo: "1.3.0",
      licenseConcluded: "WTFPL",
      externalRefs: [
        {
          referenceCategory: "PACKAGE-MANAGER",
          referenceType: "purl",
          referenceLocator: "pkg:npm/left-pad@1.3.0",
        },
      ],
    },
  ],
};

describe("formatHasProxySbom", () => {
  it("is true for the formats whose proxy path runs an inline scan", () => {
    for (const format of ["npm", "pypi", "docker", "oci", "podman", "oras"]) {
      expect(formatHasProxySbom(format)).toBe(true);
    }
  });

  it("is false for formats with no inline proxy scan", () => {
    // Maven and Go proxies never catalog anything, so there is no inventory to
    // fetch and the panel says so rather than erroring on an empty response.
    expect(formatHasProxySbom("maven")).toBe(false);
    expect(formatHasProxySbom("go")).toBe(false);
    expect(formatHasProxySbom(null)).toBe(false);
    expect(formatHasProxySbom(undefined)).toBe(false);
  });
});

describe("unwrapSbomDocument", () => {
  it("accepts a bare document", () => {
    expect(unwrapSbomDocument(CYCLONEDX)).toEqual(CYCLONEDX);
  });

  it("accepts an envelope around the document", () => {
    expect(unwrapSbomDocument({ document: CYCLONEDX })).toEqual(CYCLONEDX);
    expect(unwrapSbomDocument({ sbom: SPDX })).toEqual(SPDX);
  });

  it("accepts a document delivered as a JSON string", () => {
    expect(unwrapSbomDocument(JSON.stringify(CYCLONEDX))).toEqual(CYCLONEDX);
  });

  it("returns null for an envelope with an explicitly absent document", () => {
    // Must not fall through and parse the envelope itself as the document.
    expect(unwrapSbomDocument({ document: null })).toBeNull();
    expect(unwrapSbomDocument({ sbom: undefined })).toBeNull();
  });

  it("returns null for bodies that are not documents at all", () => {
    expect(unwrapSbomDocument(null)).toBeNull();
    expect(unwrapSbomDocument(undefined)).toBeNull();
    expect(unwrapSbomDocument("")).toBeNull();
    expect(unwrapSbomDocument("not json")).toBeNull();
    expect(unwrapSbomDocument([1, 2, 3])).toBeNull();
    expect(unwrapSbomDocument(42)).toBeNull();
  });
});

describe("detectSbomFormat", () => {
  it("reads the document's own marker", () => {
    expect(detectSbomFormat(CYCLONEDX)).toBe("cyclonedx");
    expect(detectSbomFormat(SPDX)).toBe("spdx");
  });

  it("falls back to the shape when the marker is missing", () => {
    expect(detectSbomFormat({ components: [] })).toBe("cyclonedx");
    expect(detectSbomFormat({ packages: [] })).toBe("spdx");
  });

  it("reports unknown rather than guessing", () => {
    expect(detectSbomFormat({ metadata: {} })).toBe("unknown");
  });
});

describe("parseProxySbom — CycloneDX", () => {
  it("normalizes name, version, license and purl", () => {
    const inventory = parseProxySbom(CYCLONEDX);
    expect(inventory).toEqual({
      kind: "present",
      format: "cyclonedx",
      components: [
        {
          name: "jinja2",
          version: "2.11.2",
          license: "BSD-3-Clause",
          purl: "pkg:pypi/jinja2@2.11.2",
        },
        {
          name: "markupsafe",
          version: "1.1.1",
          license: "BSD-3-Clause OR MIT",
          purl: "pkg:pypi/markupsafe@1.1.1",
        },
      ],
    });
  });

  it("falls back to the license name when there is no id", () => {
    const inventory = parseProxySbom({
      bomFormat: "CycloneDX",
      components: [{ name: "x", licenses: [{ license: { name: "Custom EULA" } }] }],
    });
    expect(inventory).toMatchObject({
      components: [{ name: "x", license: "Custom EULA" }],
    });
  });

  it("reports a missing license as null rather than inventing one", () => {
    const inventory = parseProxySbom({
      bomFormat: "CycloneDX",
      components: [{ name: "x", version: "1.0" }],
    });
    expect(inventory).toMatchObject({
      components: [{ name: "x", version: "1.0", license: null, purl: null }],
    });
  });

  it("drops entries with no usable name", () => {
    const inventory = parseProxySbom({
      bomFormat: "CycloneDX",
      components: [{ name: "" }, { version: "1.0" }, { name: "  keep  " }],
    });
    expect(inventory).toMatchObject({ components: [{ name: "keep" }] });
  });
});

describe("parseProxySbom — SPDX", () => {
  it("reads versionInfo, licenseConcluded and the purl external ref", () => {
    expect(parseProxySbom(SPDX)).toEqual({
      kind: "present",
      format: "spdx",
      components: [
        {
          name: "left-pad",
          version: "1.3.0",
          license: "WTFPL",
          purl: "pkg:npm/left-pad@1.3.0",
        },
      ],
    });
  });

  it("falls back to licenseDeclared when nothing is concluded", () => {
    const inventory = parseProxySbom({
      spdxVersion: "SPDX-2.2",
      packages: [
        { name: "x", licenseConcluded: "NOASSERTION", licenseDeclared: "MIT" },
      ],
    });
    expect(inventory).toMatchObject({ components: [{ license: "MIT" }] });
  });

  it("treats NOASSERTION and NONE as unknown, not as a license", () => {
    const inventory = parseProxySbom({
      spdxVersion: "SPDX-2.3",
      packages: [
        { name: "x", licenseConcluded: "NOASSERTION", licenseDeclared: "NONE" },
      ],
    });
    expect(inventory).toMatchObject({ components: [{ license: null }] });
  });

  it("ignores external refs that are not purls", () => {
    const inventory = parseProxySbom({
      spdxVersion: "SPDX-2.3",
      packages: [
        {
          name: "x",
          externalRefs: [
            { referenceType: "cpe23Type", referenceLocator: "cpe:2.3:a:x" },
            { referenceType: "purl", referenceLocator: "pkg:npm/x@1" },
          ],
        },
      ],
    });
    expect(inventory).toMatchObject({ components: [{ purl: "pkg:npm/x@1" }] });
  });
});

// ---------------------------------------------------------------------------
// The rule this module exists to enforce.
// ---------------------------------------------------------------------------

describe("parseProxySbom — an empty inventory is not an empty SBOM", () => {
  it("reports a document with zero components as absent, never as present-and-empty", () => {
    // Rendering a zero-row table would assert the artifact has no
    // dependencies. Nothing in the data supports that claim — the same class
    // of bug as the green all-clear shield.
    expect(parseProxySbom({ bomFormat: "CycloneDX", components: [] })).toEqual({
      kind: "absent",
    });
    expect(parseProxySbom({ spdxVersion: "SPDX-2.3", packages: [] })).toEqual({
      kind: "absent",
    });
  });

  it("reports a missing document as absent", () => {
    expect(parseProxySbom(undefined)).toEqual({ kind: "absent" });
    expect(parseProxySbom(null)).toEqual({ kind: "absent" });
    expect(parseProxySbom({ document: null })).toEqual({ kind: "absent" });
  });

  it("reports an unparseable body as absent rather than throwing", () => {
    expect(parseProxySbom("<html>gateway error</html>")).toEqual({
      kind: "absent",
    });
    expect(parseProxySbom({ unexpected: "shape" })).toEqual({ kind: "absent" });
  });

  it("keeps the not-recorded copy forward-looking about how one appears", () => {
    expect(PROXY_SBOM_NOT_RECORDED_COPY).toContain("No SBOM recorded");
    expect(PROXY_SBOM_NOT_RECORDED_COPY).toMatch(/next time it is pulled/);
  });
});

describe("formatSbomDocument", () => {
  it("pretty-prints the unwrapped document", () => {
    const text = formatSbomDocument({ document: CYCLONEDX });
    expect(text).toContain('"bomFormat": "CycloneDX"');
    expect(JSON.parse(text)).toEqual(CYCLONEDX);
  });

  it("returns an empty string when there is no document", () => {
    expect(formatSbomDocument(null)).toBe("");
    expect(formatSbomDocument("not json")).toBe("");
  });
});

describe("sbomLicenseSummary", () => {
  it("deduplicates and sorts, dropping unknowns", () => {
    expect(
      sbomLicenseSummary([
        { name: "a", version: null, license: "MIT", purl: null },
        { name: "b", version: null, license: "Apache-2.0", purl: null },
        { name: "c", version: null, license: "MIT", purl: null },
        { name: "d", version: null, license: null, purl: null },
      ]),
    ).toEqual(["Apache-2.0", "MIT"]);
  });

  it("is empty when nothing declared a license", () => {
    expect(
      sbomLicenseSummary([{ name: "a", version: null, license: null, purl: null }]),
    ).toEqual([]);
  });
});
