import type { RepositoryFormat } from "@/types";

// Format filter for the staging list. No separate "Gradle" entry: Gradle is
// served by the Maven handler and Gradle clients use Maven repositories, so
// the option matched nothing (#814).
export const FORMAT_OPTIONS: { value: RepositoryFormat; label: string }[] = [
  { value: "maven", label: "Maven" },
  { value: "npm", label: "NPM" },
  { value: "pypi", label: "PyPI" },
  { value: "nuget", label: "NuGet" },
  { value: "go", label: "Go" },
  { value: "cargo", label: "Cargo" },
  { value: "rubygems", label: "RubyGems" },
  { value: "conan", label: "Conan" },
  { value: "composer", label: "Composer" },
  { value: "docker", label: "Docker" },
  { value: "helm", label: "Helm" },
  { value: "generic", label: "Generic" },
];

export const POLICY_STATUS_LABELS = {
  passing: "Passing",
  failing: "Failing",
  warning: "Warning",
  pending: "Pending",
} as const;
