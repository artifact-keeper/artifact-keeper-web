import { describe, it, expect } from "vitest";
import { condaPackageFields, isCondaFormat, parseCondaFilename } from "../conda";

describe("parseCondaFilename", () => {
  it("splits name, version and build from the right", () => {
    expect(parseCondaFilename("acme-report-1.2.0-pyhd8ed1ab_0.conda")).toEqual({
      name: "acme-report",
      version: "1.2.0",
      build: "pyhd8ed1ab_0",
    });
    expect(parseCondaFilename("libwebp-1.3.2-h11a3e52_0.tar.bz2")?.build).toBe("h11a3e52_0");
  });

  it("returns undefined for files that are not conda packages", () => {
    expect(parseCondaFilename("repodata.json")).toBeUndefined();
    expect(parseCondaFilename("x.conda")).toBeUndefined();
  });
});

describe("condaPackageFields", () => {
  it("prefers the recorded index.json fields", () => {
    const f = condaPackageFields("noarch/acme-core-0.1.0-py_0.conda", {
      subdir: "linux-64",
      build: "real_1",
      license: "Apache-2.0",
      depends: ["python >=3.10", 7],
    });
    expect(f.subdir).toBe("linux-64");
    expect(f.build).toBe("real_1");
    expect(f.license).toBe("Apache-2.0");
    expect(f.depends).toEqual(["python >=3.10"]);
  });

  it("falls back to the path when the listing carries no metadata", () => {
    const f = condaPackageFields("linux-64/acme-fastmath-0.3.0-h1234_0.conda");
    expect(f).toMatchObject({ subdir: "linux-64", name: "acme-fastmath", build: "h1234_0" });
    expect(f.depends).toEqual([]);
  });
});

describe("isCondaFormat", () => {
  it("covers both conda handlers", () => {
    expect(isCondaFormat("conda")).toBe(true);
    expect(isCondaFormat("conda_native")).toBe(true);
    expect(isCondaFormat("pypi")).toBe(false);
  });
});
