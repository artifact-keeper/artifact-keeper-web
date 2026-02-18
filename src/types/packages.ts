export type PackageType =
  | 'maven'
  | 'gradle'
  | 'npm'
  | 'pypi'
  | 'nuget'
  | 'go'
  | 'rubygems'
  | 'docker'
  | 'helm'
  | 'rpm'
  | 'debian'
  | 'conan'
  | 'cargo'
  | 'generic'
  | 'podman'
  | 'buildx'
  | 'oras'
  | 'wasm_oci'
  | 'helm_oci'
  | 'poetry'
  | 'conda'
  | 'yarn'
  | 'bower'
  | 'pnpm'
  | 'chocolatey'
  | 'powershell'
  | 'terraform'
  | 'opentofu'
  | 'alpine'
  | 'conda_native'
  | 'composer'
  | 'hex'
  | 'cocoapods'
  | 'swift'
  | 'pub'
  | 'sbt'
  | 'chef'
  | 'puppet'
  | 'ansible'
  | 'gitlfs'
  | 'vscode'
  | 'jetbrains'
  | 'huggingface'
  | 'mlmodel'
  | 'cran'
  | 'vagrant'
  | 'opkg'
  | 'p2'
  | 'bazel'
  | 'incus'
  | 'lxc';

export interface Package {
  id: string;
  repository_key: string;
  name: string;
  version: string;
  format: string;
  description?: string;
  size_bytes: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface PackageVersion {
  version: string;
  size_bytes: number;
  download_count: number;
  created_at: string;
  checksum_sha256: string;
}
