import { MCP_OFFICIAL_REGISTRY_URL } from "@/lib/mcp/format";

/** Common upstream registry URLs by package format. */
export const DEFAULT_UPSTREAM_URLS: Record<string, string> = {
  github: "https://github.com",
  mise: "https://github.com",
  aqua: "https://github.com",
  maven: "https://repo.maven.apache.org/maven2",
  gradle: "https://repo.maven.apache.org/maven2",
  npm: "https://registry.npmjs.org",
  pypi: "https://pypi.org/simple",
  docker: "https://registry-1.docker.io",
  nuget: "https://api.nuget.org/v3/index.json",
  cargo: "https://index.crates.io",
  go: "https://proxy.golang.org",
  rubygems: "https://rubygems.org",
  cocoapods: "https://cdn.cocoapods.org",
  composer: "https://repo.packagist.org",
  conan: "https://center.conan.io",
  // A conda upstream is a channel URL: the backend appends `{subdir}/repodata.json`
  // and `channeldata.json` to it, so the bare anaconda.org root 404s.
  conda: "https://conda.anaconda.org/conda-forge",
  conda_native: "https://conda.anaconda.org/conda-forge",
  pub: "https://pub.dev",
  swift: "https://github.com",
  hex: "https://repo.hex.pm",
  alpine: "https://dl-cdn.alpinelinux.org/alpine",
  debian: "https://deb.debian.org/debian",
  rpm: "https://mirror.stream.centos.org",
  vscode: "https://open-vsx.org/vscode/gallery",
  // A Remote MCP repository proxies the official registry by default
  // (artifact-keeper#5253, Phase 2); deny by default still applies.
  mcp: MCP_OFFICIAL_REGISTRY_URL,
};
