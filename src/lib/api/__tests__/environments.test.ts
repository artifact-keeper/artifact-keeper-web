import { describe, it, expect } from "vitest";
import { adaptEnvironment, adaptLookup } from "../environments";

describe("adaptEnvironment", () => {
  it("reads the stored envelope and its summary", () => {
    expect(
      adaptEnvironment({
        id: "e1",
        name: "report-app",
        lockfileFormat: "pixi.lock",
        summary: { scopes: 2, distinctPackages: 57 },
        updatedAt: "2026-10-06T00:00:00Z",
      }),
    ).toMatchObject({ id: "e1", name: "report-app", distinctPackages: 57, scopes: 2 });
  });

  it("drops entries without an id or name", () => {
    expect(adaptEnvironment({ name: "x" })).toBeNull();
  });
});

describe("adaptLookup", () => {
  it("keeps complete hits with their inclusion paths", () => {
    const r = adaptLookup(
      {
        query: { purl: "pkg:conda/acme-core@0.1.0", purlBase: "pkg:conda/acme-core@0.1.0" },
        truncated: false,
        hits: [
          {
            environment: { id: "e1", name: "report-app" },
            repository: { id: "r", key: "conda-internal" },
            scope: { environment: "default", platform: "linux-64" },
            package: { name: "acme-core", version: "0.1.0", purl: "pkg:conda/acme-core@0.1.0?build=py_0" },
            paths: [["acme-report@1.0.0", "acme-core@0.1.0"]],
          },
          { environment: { id: "e2" } },
        ],
      },
      "pkg:conda/acme-core@0.1.0",
    );
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].paths[0]).toEqual(["acme-report@1.0.0", "acme-core@0.1.0"]);
  });
});

import { adaptEnvironmentSbom } from "../environments";

describe("adaptEnvironmentSbom", () => {
  it("keeps one document per scope", () => {
    const s = adaptEnvironmentSbom(
      {
        lockfile: "pixi.lock",
        lockfileFormat: "pixi",
        sbomFormat: "cyclonedx",
        graphs: [
          { environment: "default", platform: "linux-64", document: { bomFormat: "CycloneDX" } },
          { environment: "default" },
        ],
        summary: { distinctPackages: 12 },
      },
      "pixi.lock",
    );
    expect(s.graphs).toHaveLength(1);
    expect(s.graphs[0].platform).toBe("linux-64");
    expect(s.distinctPackages).toBe(12);
  });
});
