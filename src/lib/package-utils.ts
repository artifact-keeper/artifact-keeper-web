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
    case "buildx":
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
    case "conda":
    case "conda_native":
      return `conda install ${packageName}=${v}`;
    case "alpine":
      return `apk add ${packageName}=${v}`;
    case "pub":
      return `dart pub add ${packageName}:${v}`;
    case "ansible":
      return `ansible-galaxy collection install ${packageName}:${v}`;
    case "cran":
      return `install.packages("${packageName}")`;
    case "vagrant":
      return `vagrant box add ${packageName} --box-version ${v}`;
    case "puppet":
      return `puppet module install ${packageName} --version ${v}`;
    case "chef":
      return `knife supermarket install ${packageName} ${v}`;
    case "conan":
      return `conan install ${packageName}/${v}@`;
    case "vscode":
      return `code --install-extension ${packageName}@${v}`;
    case "jetbrains":
      return `Download ${packageName} v${v}`;
    case "chocolatey":
      return `choco install ${packageName} --version ${v}`;
    case "powershell":
      return `Install-Module ${packageName} -RequiredVersion ${v}`;
    case "huggingface":
      return `huggingface-cli download ${packageName}`;
    case "bazel":
      return `bazel_dep(name = "${packageName}", version = "${v}")`;
    case "rpm":
      return `rpm -i ${packageName}-${v}.rpm`;
    case "debian":
      return `apt-get install ${packageName}=${v}`;
    case "oras":
    case "wasm_oci":
      return `oras pull ${packageName}:${v}`;
    case "bower":
      return `bower install ${packageName}#${v}`;
    case "gitlfs":
      return `git lfs pull ${packageName}`;
    case "mlmodel":
      return `Download ${packageName} v${v}`;
    case "opkg":
      return `opkg install ${packageName}`;
    case "p2":
      return `Download ${packageName} v${v}`;
    case "protobuf":
      return `Download ${packageName} v${v}`;
    default:
      return `Download ${packageName} v${v}`;
  }
}

export const FORMAT_OPTIONS: string[] = [
  "maven",
  "gradle",
  "npm",
  "pypi",
  "nuget",
  "go",
  "rubygems",
  "docker",
  "helm",
  "rpm",
  "debian",
  "conan",
  "cargo",
  "generic",
  "podman",
  "buildx",
  "oras",
  "wasm_oci",
  "helm_oci",
  "poetry",
  "conda",
  "yarn",
  "bower",
  "pnpm",
  "chocolatey",
  "powershell",
  "terraform",
  "opentofu",
  "alpine",
  "conda_native",
  "composer",
  "hex",
  "cocoapods",
  "swift",
  "pub",
  "sbt",
  "chef",
  "puppet",
  "ansible",
  "gitlfs",
  "vscode",
  "jetbrains",
  "huggingface",
  "mlmodel",
  "cran",
  "vagrant",
  "opkg",
  "p2",
  "bazel",
  "protobuf",
];
