import type { RepositoryFormat, RepositoryType } from "@/types";

export const FORMAT_OPTIONS: { value: RepositoryFormat; label: string; group: string }[] = [
  // Core package managers
  { value: "maven", label: "Maven", group: "Core" },
  { value: "gradle", label: "Gradle", group: "Core" },
  { value: "npm", label: "NPM", group: "Core" },
  { value: "pypi", label: "PyPI", group: "Core" },
  { value: "nuget", label: "NuGet", group: "Core" },
  { value: "go", label: "Go", group: "Core" },
  { value: "cargo", label: "Cargo", group: "Core" },
  { value: "rubygems", label: "RubyGems", group: "Core" },
  { value: "conan", label: "Conan (C/C++)", group: "Core" },
  { value: "composer", label: "Composer (PHP)", group: "Core" },
  { value: "hex", label: "Hex (Erlang/Elixir)", group: "Core" },
  { value: "pub", label: "Pub (Dart)", group: "Core" },
  { value: "sbt", label: "SBT (Scala)", group: "Core" },
  { value: "cran", label: "CRAN (R)", group: "Core" },
  { value: "generic", label: "Generic", group: "Core" },
  // Container / OCI
  { value: "docker", label: "Docker", group: "Container" },
  { value: "helm", label: "Helm", group: "Container" },
  { value: "podman", label: "Podman", group: "Container" },
  { value: "buildx", label: "Buildx", group: "Container" },
  { value: "oras", label: "ORAS", group: "Container" },
  { value: "wasm_oci", label: "WASM OCI", group: "Container" },
  { value: "helm_oci", label: "Helm OCI", group: "Container" },
  // Linux distro packages
  { value: "debian", label: "Debian/APT", group: "Linux" },
  { value: "rpm", label: "RPM/YUM", group: "Linux" },
  { value: "alpine", label: "Alpine APK", group: "Linux" },
  { value: "opkg", label: "OPKG", group: "Linux" },
  // Language ecosystem aliases
  { value: "poetry", label: "Poetry", group: "Ecosystem" },
  { value: "conda", label: "Conda", group: "Ecosystem" },
  { value: "conda_native", label: "Conda Native", group: "Ecosystem" },
  { value: "yarn", label: "Yarn", group: "Ecosystem" },
  { value: "pnpm", label: "PNPM", group: "Ecosystem" },
  { value: "bower", label: "Bower", group: "Ecosystem" },
  { value: "chocolatey", label: "Chocolatey", group: "Ecosystem" },
  { value: "powershell", label: "PowerShell", group: "Ecosystem" },
  { value: "cocoapods", label: "CocoaPods", group: "Ecosystem" },
  { value: "swift", label: "Swift", group: "Ecosystem" },
  // Infrastructure / IaC
  { value: "terraform", label: "Terraform", group: "Infrastructure" },
  { value: "opentofu", label: "OpenTofu", group: "Infrastructure" },
  { value: "chef", label: "Chef", group: "Infrastructure" },
  { value: "puppet", label: "Puppet", group: "Infrastructure" },
  { value: "ansible", label: "Ansible", group: "Infrastructure" },
  { value: "vagrant", label: "Vagrant", group: "Infrastructure" },
  // IDE extensions
  { value: "vscode", label: "VS Code Extensions", group: "Extensions" },
  { value: "jetbrains", label: "JetBrains Plugins", group: "Extensions" },
  // ML/AI
  { value: "huggingface", label: "HuggingFace", group: "ML/AI" },
  { value: "mlmodel", label: "ML Model", group: "ML/AI" },
  // Other
  { value: "gitlfs", label: "Git LFS", group: "Other" },
  { value: "bazel", label: "Bazel", group: "Other" },
  { value: "p2", label: "P2 (Eclipse)", group: "Other" },
];

export const FORMAT_GROUPS = Array.from(
  FORMAT_OPTIONS.reduce((map, o) => {
    if (!map.has(o.group)) map.set(o.group, []);
    map.get(o.group)!.push(o);
    return map;
  }, new Map<string, typeof FORMAT_OPTIONS>())
);

export const TYPE_OPTIONS: { value: RepositoryType; label: string }[] = [
  { value: "local", label: "Local" },
  { value: "remote", label: "Remote" },
  { value: "virtual", label: "Virtual" },
];
