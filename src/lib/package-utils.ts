export function getInstallCommand(
  packageName: string,
  version: string | undefined,
  format: string
): string {
  const v = version || "latest";
  switch (format) {
    case "npm":
    case "yarn":
    case "pnpm":
      return `npm install ${packageName}@${v}`;
    case "pypi":
    case "poetry":
      return `pip install ${packageName}==${v}`;
    case "maven":
    case "gradle":
    case "sbt":
      return `<dependency>\n  <groupId>...</groupId>\n  <artifactId>${packageName}</artifactId>\n  <version>${v}</version>\n</dependency>`;
    case "cargo":
      return `cargo add ${packageName}@${v}`;
    case "nuget":
      return `dotnet add package ${packageName} --version ${v}`;
    case "go":
      return `go get ${packageName}@v${v}`;
    case "rubygems":
      return `gem install ${packageName} -v ${v}`;
    case "docker":
    case "podman":
      return `docker pull ${packageName}:${v}`;
    case "helm":
    case "helm_oci":
      return `helm install ${packageName} --version ${v}`;
    case "composer":
      return `composer require ${packageName}:${v}`;
    case "hex":
      return `mix deps.get ${packageName} ${v}`;
    case "cocoapods":
      return `pod '${packageName}', '${v}'`;
    case "swift":
      return `.package(url: "${packageName}", from: "${v}")`;
    case "terraform":
    case "opentofu":
      return `terraform {\n  required_providers {\n    ${packageName} = { version = "${v}" }\n  }\n}`;
    default:
      return `Download ${packageName} v${v}`;
  }
}

export const FORMAT_OPTIONS: string[] = [
  "maven",
  "npm",
  "pypi",
  "docker",
  "helm",
  "cargo",
  "nuget",
  "go",
  "rubygems",
  "debian",
  "rpm",
  "protobuf",
  "generic",
];
