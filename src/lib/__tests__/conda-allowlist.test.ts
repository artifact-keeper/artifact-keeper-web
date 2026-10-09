import { describe, it, expect } from "vitest";
import {
  ALLOWLIST_LIMITS,
  backendEntryIndex,
  describeAllowlistAudit,
  detectLockfile,
  formatAllowlistLine,
  mergeAllowlistEntries,
  normalizeAllowlistEntry,
  parseAllowlistLines,
  parseLockfile,
  validateAllowlistEntry,
} from "../conda-allowlist";

describe("validateAllowlistEntry", () => {
  it("accepts names, globs and mixed case the way the backend does", () => {
    expect(validateAllowlistEntry({ name: "numpy" })).toBeNull();
    expect(validateAllowlistEntry({ name: "lib*" })).toBeNull();
    expect(validateAllowlistEntry({ name: "py?hon" })).toBeNull();
    expect(validateAllowlistEntry({ name: " NumPy " })).toBeNull();
    expect(validateAllowlistEntry({ name: "_openmp_mutex", version: "4.5", subdirs: ["linux-64"] })).toBeNull();
  });

  it("rejects empty names and characters conda names never use", () => {
    expect(validateAllowlistEntry({ name: "  " })).toMatch(/required/);
    expect(validateAllowlistEntry({ name: "num py" })).toMatch(/a-z, 0-9/);
    expect(validateAllowlistEntry({ name: "numpy>=2" })).toMatch(/a-z, 0-9/);
  });

  it("enforces the byte limits on name and version", () => {
    const max = ALLOWLIST_LIMITS.maxNameBytes;
    expect(validateAllowlistEntry({ name: "a".repeat(max) })).toBeNull();
    expect(validateAllowlistEntry({ name: "a".repeat(max + 1) })).toMatch(/128 bytes/);
    expect(validateAllowlistEntry({ name: "a", version: "1".repeat(256) })).toBeNull();
    expect(validateAllowlistEntry({ name: "a", version: "1".repeat(257) })).toMatch(/256 bytes/);
  });

  it("checks subdir count and shape", () => {
    const many = Array.from({ length: 33 }, (_, i) => `s${i}`);
    expect(validateAllowlistEntry({ name: "a", subdirs: many })).toMatch(/32 subdirs/);
    expect(validateAllowlistEntry({ name: "a", subdirs: many.slice(0, 32) })).toBeNull();
    expect(validateAllowlistEntry({ name: "a", subdirs: ["Linux 64"] })).toMatch(/not a conda subdir/);
    expect(validateAllowlistEntry({ name: "a", subdirs: ["x".repeat(33)] })).toMatch(/not a conda subdir/);
  });
});

describe("normalizeAllowlistEntry", () => {
  it("drops an empty or * version and empty subdirs", () => {
    expect(normalizeAllowlistEntry({ name: " numpy ", version: "*", subdirs: [] })).toEqual({ name: "numpy" });
    expect(normalizeAllowlistEntry({ name: "numpy", version: " ", subdirs: [" ", "noarch "] })).toEqual({
      name: "numpy",
      subdirs: ["noarch"],
    });
  });
});

describe("parseAllowlistLines", () => {
  it("reads name, version and comma-separated subdirs, skipping blanks and comments", () => {
    const { entries, errors } = parseAllowlistLines(
      "# approved\nnumpy 2.2.3 linux-64\n\npandas >=2,<3\nlibblas * linux-64,osx-arm64  # any version\ntzdata\n",
    );
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { name: "numpy", version: "2.2.3", subdirs: ["linux-64"] },
      { name: "pandas", version: ">=2,<3" },
      { name: "libblas", subdirs: ["linux-64", "osx-arm64"] },
      { name: "tzdata" },
    ]);
  });

  it("reports bad lines by number", () => {
    const { entries, errors } = parseAllowlistLines("numpy\nnum py 1 2 3\nbad! 1.0\nok 1 Linux");
    expect(entries).toEqual([{ name: "numpy" }]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors[0].message).toMatch(/no spaces/);
  });

  it("round-trips through formatAllowlistLine", () => {
    const entries = [
      { name: "a" },
      { name: "b", version: "1.0" },
      { name: "c", subdirs: ["noarch"] },
      { name: "d", version: ">=2", subdirs: ["linux-64", "noarch"] },
    ];
    const text = entries.map(formatAllowlistLine).join("\n");
    expect(text).toBe("a\nb 1.0\nc * noarch\nd >=2 linux-64,noarch");
    expect(parseAllowlistLines(text).entries).toEqual(entries);
  });
});

const PIXI_V7 = `version: 7
platforms:
- name: linux-64
environments:
  default:
    channels:
    - url: https://ak.internal/conda/conda-virtual/
    packages:
      linux-64:
      - conda: https://ak.internal/conda/conda-virtual/linux-64/numpy-2.2.3-py310h_0.conda
      - pypi: https://ak.internal/pypi/rich-13.0.0-py3-none-any.whl
packages:
- conda: https://ak.internal/conda/conda-virtual/linux-64/numpy-2.2.3-py310hefbff90_0.conda
  sha256: abc
  depends:
  - python >=3.10
  - libblas >=3.9.0,<4.0a0
  license: BSD-3-Clause
- conda: https://ak.internal/conda/conda-virtual/osx-arm64/numpy-2.2.3-py310h_0.conda
  sha256: def
- conda: https://ak.internal/conda/conda-virtual/linux-64/ld_impl_linux-64-2.46.1-default_hbd61a6d_102.conda
- conda: https://ak.internal/conda/conda-internal/noarch/acme-core-1.0.0-pyh4616a5c_0.tar.bz2
- pypi: https://ak.internal/pypi/rich-13.0.0-py3-none-any.whl
  name: rich
  version: 13.0.0
- conda: .
  name: my-source-package
  version: 0.1.0
  subdir: noarch
- conda: ../vendored
`;

const PIXI_V4 = `version: 4
environments:
  default:
    packages:
      linux-64:
      - conda: https://conda.anaconda.org/conda-forge/linux-64/bzip2-1.0.8-hd590300_5.conda
packages:
- kind: conda
  name: bzip2
  version: 1.0.8
  build: hd590300_5
  subdir: linux-64
  url: https://conda.anaconda.org/conda-forge/linux-64/bzip2-1.0.8-hd590300_5.conda
- kind: pypi
  name: requests
  version: 2.31.0
  url: https://files.pythonhosted.org/requests-2.31.0-py3-none-any.whl
`;

const CONDA_LOCK = `version: 1
metadata:
  content_hash:
    linux-64: abc
  channels:
  - url: conda-forge
    used_env_vars: []
  platforms:
  - linux-64
  - osx-arm64
package:
- name: tzdata
  version: 2024a
  manager: conda
  platform: linux-64
  dependencies: {}
  url: https://conda.anaconda.org/conda-forge/noarch/tzdata-2024a-h0c530f3_0.conda
  hash:
    md5: 161081fc7cec0bfda0d86d7cb595f8d8
  category: main
  optional: false
- name: tzdata
  version: 2024a
  manager: conda
  platform: osx-arm64
  dependencies: {}
  url: https://conda.anaconda.org/conda-forge/noarch/tzdata-2024a-h0c530f3_0.conda
  category: main
  optional: false
- name: _libgcc_mutex
  version: '0.1'
  manager: conda
  platform: linux-64
  dependencies: {}
  url: https://conda.anaconda.org/conda-forge/linux-64/_libgcc_mutex-0.1-conda_forge.tar.bz2
- name: python
  version: 3.12.2
  manager: conda
  platform: osx-arm64
  dependencies:
    bzip2: '>=1.0.8,<2.0a0'
  url: https://conda.anaconda.org/conda-forge/osx-arm64/python-3.12.2-hdf0ec26_0_cpython.conda
- name: requests
  version: 2.31.0
  manager: pip
  platform: linux-64
  dependencies: {}
  url: https://files.pythonhosted.org/packages/requests-2.31.0-py3-none-any.whl
`;

describe("parseLockfile", () => {
  it("reads a pixi.lock v6+ like allowlist/from-lock.sh: name, exact version, subdirs", () => {
    const r = parseLockfile(PIXI_V7, "pixi.lock");
    expect(r?.kind).toBe("pixi.lock");
    expect(r?.entries).toEqual([
      { name: "acme-core", version: "1.0.0", subdirs: ["noarch"] },
      { name: "ld_impl_linux-64", version: "2.46.1", subdirs: ["linux-64"] },
      { name: "my-source-package", version: "0.1.0", subdirs: ["noarch"] },
      // One entry for the two platforms numpy is locked for.
      { name: "numpy", version: "2.2.3", subdirs: ["linux-64", "osx-arm64"] },
    ]);
    // The environment's package index (indented `packages:`) is not read.
    expect(r?.packages).toBe(5);
    expect(r?.subdirCounts).toEqual({ "linux-64": 2, noarch: 2, "osx-arm64": 1 });
  });

  it("reads the older pixi.lock `kind: conda` records and skips pypi", () => {
    expect(parseLockfile(PIXI_V4)?.entries).toEqual([
      { name: "bzip2", version: "1.0.8", subdirs: ["linux-64"] },
    ]);
  });

  it("reads conda-lock.yml, takes the subdir from the URL, skips pip", () => {
    const r = parseLockfile(CONDA_LOCK, "conda-lock.yml");
    expect(r?.kind).toBe("conda-lock.yml");
    expect(r?.entries).toEqual([
      { name: "_libgcc_mutex", version: "0.1", subdirs: ["linux-64"] },
      { name: "python", version: "3.12.2", subdirs: ["osx-arm64"] },
      // Listed once per platform, but a noarch package.
      { name: "tzdata", version: "2024a", subdirs: ["noarch"] },
    ]);
    expect(r?.packages).toBe(4);
  });

  it("detects the format from the content when the name says nothing", () => {
    expect(detectLockfile(PIXI_V7, "upload.txt")).toBe("pixi.lock");
    expect(detectLockfile(CONDA_LOCK, "env.yml")).toBe("conda-lock.yml");
    expect(parseLockfile("name: env\ndependencies:\n- numpy\n", "environment.yml")).toBeNull();
  });

  it("handles CRLF line endings", () => {
    expect(parseLockfile(PIXI_V4.replace(/\n/g, "\r\n"))?.entries).toHaveLength(1);
  });
});

describe("mergeAllowlistEntries", () => {
  it("adds new (name, version) pairs and widens the subdirs of existing ones", () => {
    const { entries, added, updated } = mergeAllowlistEntries(
      [
        { name: "numpy", version: "2.2.3", subdirs: ["linux-64"] },
        { name: "tzdata" },
      ],
      [
        { name: "NumPy", version: "2.2.3", subdirs: ["osx-arm64"] },
        { name: "tzdata", subdirs: ["noarch"] },
        { name: "pandas", version: "2.2.3" },
        { name: "numpy", version: "2.2.3", subdirs: ["linux-64"] },
      ],
    );
    expect(entries).toEqual([
      { name: "numpy", version: "2.2.3", subdirs: ["linux-64", "osx-arm64"] },
      // Already every subdir: unchanged.
      { name: "tzdata" },
      { name: "pandas", version: "2.2.3" },
    ]);
    expect(added).toBe(1);
    expect(updated).toBe(1);
  });

  it("an incoming entry without subdirs widens an existing one to every subdir", () => {
    const { entries } = mergeAllowlistEntries([{ name: "a", subdirs: ["noarch"] }], [{ name: "a" }]);
    expect(entries).toEqual([{ name: "a" }]);
  });
});

describe("backendEntryIndex", () => {
  it("finds the entry the backend names", () => {
    expect(backendEntryIndex('entries[12]: version ">=>2" is not a conda version spec')).toBe(12);
    expect(backendEntryIndex("entries: at most 10000 entries are allowed")).toBeNull();
    expect(backendEntryIndex(null)).toBeNull();
  });
});

describe("describeAllowlistAudit", () => {
  it("renders previous and current counts", () => {
    expect(
      describeAllowlistAudit({
        repository: "conda-virtual",
        previous: { enabled: false, entry_count: 43 },
        current: { enabled: true, entry_count: 43 },
      }),
    ).toBe("conda-virtual: off, 43 → on, 43 entries");
    expect(
      describeAllowlistAudit({ repository: "v", previous: null, current: { enabled: true, entry_count: 1 } }),
    ).toBe("v: none → on, 1 entry");
  });

  it("renders a removal and an unreadable previous list", () => {
    expect(
      describeAllowlistAudit({ repository: "v", previous: { enabled: true, entry_count: 2 }, current: null }),
    ).toBe("v: allowlist removed (was on, 2 entries)");
    expect(
      describeAllowlistAudit({ repository: "v", previous: { unusable: true }, current: { enabled: false, entry_count: 0 } }),
    ).toBe("v: unreadable → off, 0 entries");
  });

  it("returns null for details of another shape", () => {
    expect(describeAllowlistAudit(null)).toBeNull();
    expect(describeAllowlistAudit({ repository: "v" })).toBeNull();
    expect(describeAllowlistAudit({ previous: "x", current: null })).toBeNull();
  });
});
