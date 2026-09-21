import { describe, it, expect } from 'vitest';
import {
  SCAN_ON_PROXY_GATED_FORMATS,
  supportsScanOnProxy,
} from '@/lib/scan-on-proxy-formats';
import type { RepositoryFormat } from '@/types';

// ---------------------------------------------------------------------------
// Scan-on-proxy format coverage (backend artifact-keeper#1274)
// ---------------------------------------------------------------------------

// Every `RepositoryFormat` mapped to whether backend 1.10.0 enforces the
// inline proxy-scan gate for it. Typed as a total `Record`, so adding a format
// to the union without deciding its answer here fails `tsc --noEmit`.
const EXPECTED_GATED: Record<RepositoryFormat, boolean> = {
  // npm handler (`/npm`).
  npm: true,
  yarn: true,
  pnpm: true,
  bower: true,
  // PyPI handler (`/pypi`).
  pypi: true,
  poetry: true,
  jupyter: true,
  // OCI handler (`/v2`).
  docker: true,
  podman: true,
  buildx: true,
  oras: true,
  wasm_oci: true,
  helm_oci: true,
  // VS Code gallery handler (`/vscode`).
  vscode: true,
  // Everything else is served by a handler that never consults the flag.
  maven: false,
  gradle: false,
  helm: false,
  rpm: false,
  debian: false,
  go: false,
  nuget: false,
  rubygems: false,
  conan: false,
  cargo: false,
  generic: false,
  conda: false,
  conda_native: false,
  chocolatey: false,
  powershell: false,
  terraform: false,
  opentofu: false,
  alpine: false,
  composer: false,
  hex: false,
  cocoapods: false,
  swift: false,
  pub: false,
  sbt: false,
  chef: false,
  puppet: false,
  ansible: false,
  gitlfs: false,
  jetbrains: false,
  huggingface: false,
  mlmodel: false,
  cran: false,
  vagrant: false,
  opkg: false,
  p2: false,
  bazel: false,
  protobuf: false,
  incus: false,
  lxc: false,
};

describe('supportsScanOnProxy (backend artifact-keeper#1274)', () => {
  it.each(Object.entries(EXPECTED_GATED))(
    '%s -> %s',
    (format, gated) => {
      expect(supportsScanOnProxy(format as RepositoryFormat)).toBe(gated);
    },
  );

  it('matches SCAN_ON_PROXY_GATED_FORMATS exactly', () => {
    const expected = Object.entries(EXPECTED_GATED)
      .filter(([, gated]) => gated)
      .map(([format]) => format)
      .sort();
    expect([...SCAN_ON_PROXY_GATED_FORMATS].sort()).toEqual(expected);
  });

  // `conda` shares the PyPI FormatHandler (`get_handler_for_format`) but is
  // served by its own ungated `/conda` router, so the handler-key mapping is
  // the wrong source for this list.
  it('excludes conda despite its PyPI handler_key', () => {
    expect(supportsScanOnProxy('conda')).toBe(false);
    expect(supportsScanOnProxy('pypi')).toBe(true);
  });

  // `helm` (ChartMuseum at `/helm`) and `helm_oci` (`/v2`) are different
  // handlers; only the OCI one enforces the gate.
  it('distinguishes helm from helm_oci', () => {
    expect(supportsScanOnProxy('helm')).toBe(false);
    expect(supportsScanOnProxy('helm_oci')).toBe(true);
  });
});
