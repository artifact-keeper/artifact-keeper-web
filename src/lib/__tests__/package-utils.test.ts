import { describe, it, expect } from "vitest";
import { getInstallCommand, FORMAT_OPTIONS } from "../package-utils";

const pkg = "my-package";
const ver = "1.2.3";

// Data-driven test: [format, expected substring or exact match]
// Using "contains" for multi-line outputs, exact match for single-line commands.
const FORMAT_EXPECTATIONS: [string, string, "exact" | "contains"][] = [
  // JavaScript ecosystem
  ["npm", "npm install my-package@1.2.3", "exact"],
  ["yarn", "npm install my-package@1.2.3", "exact"],
  ["pnpm", "npm install my-package@1.2.3", "exact"],
  // Python
  ["pypi", "pip install my-package==1.2.3", "exact"],
  ["poetry", "pip install my-package==1.2.3", "exact"],
  // JVM — each format gets its own client snippet (#361). Pre-#361 all
  // three returned Maven XML, which was wrong for gradle/sbt repos.
  ["maven", "<artifactId>my-package</artifactId>", "contains"],
  ["gradle", "implementation 'GROUP:my-package:1.2.3'", "exact"],
  ["sbt", `libraryDependencies += "GROUP" % "my-package" % "1.2.3"`, "exact"],
  // Rust
  ["cargo", "cargo add my-package@1.2.3", "exact"],
  // .NET
  ["nuget", "dotnet add package my-package --version 1.2.3", "exact"],
  // Go
  ["go", "go get my-package@v1.2.3", "exact"],
  // Ruby
  ["rubygems", "gem install my-package -v 1.2.3", "exact"],
  // Container images
  ["docker", "docker pull my-package:1.2.3", "exact"],
  ["podman", "docker pull my-package:1.2.3", "exact"],
  ["buildx", "docker pull my-package:1.2.3", "exact"],
  // Incus/LXC containers
  ["incus", "incus image copy", "contains"],
  ["lxc", "incus image copy", "contains"],
  // Helm charts
  ["helm", "helm install my-package --version 1.2.3", "exact"],
  ["helm_oci", "helm install my-package --version 1.2.3", "exact"],
  // PHP
  ["composer", "composer require my-package:1.2.3", "exact"],
  // Elixir
  ["hex", "mix deps.get my-package 1.2.3", "exact"],
  // Apple
  ["cocoapods", "pod 'my-package', '1.2.3'", "exact"],
  ["swift", '.package(url: "my-package", from: "1.2.3")', "exact"],
  // Infrastructure
  ["terraform", "required_providers", "contains"],
  ["opentofu", "required_providers", "contains"],
  // Conda
  ["conda", "conda install my-package=1.2.3", "exact"],
  ["conda_native", "conda install my-package=1.2.3", "exact"],
  // Linux packages
  ["alpine", "apk add my-package=1.2.3", "exact"],
  ["debian", "apt-get install my-package=1.2.3", "exact"],
  ["rpm", "rpm -i my-package-1.2.3.rpm", "exact"],
  // Dart
  ["pub", "dart pub add my-package:1.2.3", "exact"],
  // Automation
  ["ansible", "ansible-galaxy collection install my-package:1.2.3", "exact"],
  ["vagrant", "vagrant box add my-package --box-version 1.2.3", "exact"],
  ["puppet", "puppet module install my-package --version 1.2.3", "exact"],
  ["chef", "knife supermarket install my-package 1.2.3", "exact"],
  // C/C++
  ["conan", "conan install my-package/1.2.3@", "exact"],
  // R
  ["cran", 'install.packages("my-package")', "exact"],
  // IDE extensions
  ["vscode", "code --install-extension my-package@1.2.3", "exact"],
  ["jetbrains", "Download my-package v1.2.3", "exact"],
  // Windows
  ["chocolatey", "choco install my-package --version 1.2.3", "exact"],
  ["powershell", "Install-Module my-package -RequiredVersion 1.2.3", "exact"],
  // ML/AI
  ["huggingface", "huggingface-cli download my-package", "exact"],
  // Build systems
  ["bazel", 'bazel_dep(name = "my-package", version = "1.2.3")', "exact"],
  // OCI/WASM
  ["oras", "oras pull my-package:1.2.3", "exact"],
  ["wasm_oci", "oras pull my-package:1.2.3", "exact"],
  // Legacy/Other
  ["bower", "bower install my-package#1.2.3", "exact"],
  ["gitlfs", "git lfs pull my-package", "exact"],
  ["mlmodel", "Download my-package v1.2.3", "exact"],
  ["opkg", "opkg install my-package", "exact"],
  ["p2", "Download my-package v1.2.3", "exact"],
  ["protobuf", "Download my-package v1.2.3", "exact"],
];

describe("getInstallCommand", () => {
  it.each(FORMAT_EXPECTATIONS)(
    "returns correct command for %s format",
    (format, expected, matchType) => {
      const result = getInstallCommand(pkg, ver, format);
      if (matchType === "exact") {
        expect(result).toBe(expected);
      } else {
        expect(result).toContain(expected);
      }
    }
  );

  it("returns a generic download instruction for unknown formats", () => {
    expect(getInstallCommand(pkg, ver, "unknown-format")).toBe(
      "Download my-package v1.2.3"
    );
  });

  it("uses 'latest' when version is undefined", () => {
    expect(getInstallCommand(pkg, undefined, "npm")).toBe(
      "npm install my-package@latest"
    );
    expect(getInstallCommand(pkg, undefined, "docker")).toBe(
      "docker pull my-package:latest"
    );
  });

  it("maven output includes version element", () => {
    const result = getInstallCommand(pkg, ver, "maven");
    expect(result).toContain(`<version>${ver}</version>`);
  });

  it("terraform output includes version constraint", () => {
    const result = getInstallCommand(pkg, ver, "terraform");
    expect(result).toContain('terraform {');
    expect(result).toContain(`version = "${ver}"`);
  });
});

// Maven package names are stored colon-joined as `groupId:artifactId`
// (backend maven_package_name). Issue artifact-keeper#3136: the snippet
// emitted the full name as the artifactId with a `...` placeholder groupId.
describe("getInstallCommand with colon-joined Maven coordinates", () => {
  it("splits groupId and artifactId in the pom.xml dependency snippet (issue reproduction)", () => {
    expect(
      getInstallCommand(
        "com.example.team:team-spring-archetype",
        "4.2.1-0-SNAPSHOT",
        "maven"
      )
    ).toBe(
      "<dependency>\n" +
        "  <groupId>com.example.team</groupId>\n" +
        "  <artifactId>team-spring-archetype</artifactId>\n" +
        "  <version>4.2.1-0-SNAPSHOT</version>\n" +
        "</dependency>"
    );
  });

  it("splits on the colon, not on dots: dotted groupId with hyphenated artifactId", () => {
    const result = getInstallCommand("com.acme.sub:my-artifact", "1.0", "maven");
    expect(result).toContain("<groupId>com.acme.sub</groupId>");
    expect(result).toContain("<artifactId>my-artifact</artifactId>");
    expect(result).toContain("<version>1.0</version>");
  });

  it("keeps dots inside the artifactId intact", () => {
    const result = getInstallCommand("org.foo:bar.baz", "2.0-SNAPSHOT", "maven");
    expect(result).toContain("<groupId>org.foo</groupId>");
    expect(result).toContain("<artifactId>bar.baz</artifactId>");
    expect(result).toContain("<version>2.0-SNAPSHOT</version>");
  });

  it("never leaks the colon-joined name into the artifactId element", () => {
    const result = getInstallCommand(
      "com.example.team:team-spring-archetype",
      "4.2.1-0-SNAPSHOT",
      "maven"
    );
    expect(result).not.toContain("<groupId>...</groupId>");
    expect(result).not.toContain("<artifactId>com.example.team:");
  });

  it("positive control: a colon-free name still renders as the artifactId with the placeholder groupId", () => {
    expect(getInstallCommand("my-package", "1.2.3", "maven")).toBe(
      "<dependency>\n" +
        "  <groupId>...</groupId>\n" +
        "  <artifactId>my-package</artifactId>\n" +
        "  <version>1.2.3</version>\n" +
        "</dependency>"
    );
  });

  it("gradle snippet uses the real groupId instead of the GROUP placeholder", () => {
    expect(
      getInstallCommand("com.acme.sub:my-artifact", "1.0", "gradle")
    ).toBe("implementation 'com.acme.sub:my-artifact:1.0'");
  });

  it("sbt snippet uses the real groupId instead of the GROUP placeholder", () => {
    expect(getInstallCommand("org.foo:bar.baz", "2.0-SNAPSHOT", "sbt")).toBe(
      'libraryDependencies += "org.foo" % "bar.baz" % "2.0-SNAPSHOT"'
    );
  });
});

describe("FORMAT_OPTIONS", () => {
  it("is a non-empty array of unique strings", () => {
    expect(Array.isArray(FORMAT_OPTIONS)).toBe(true);
    expect(FORMAT_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(FORMAT_OPTIONS).size).toBe(FORMAT_OPTIONS.length);
    for (const option of FORMAT_OPTIONS) {
      expect(typeof option).toBe("string");
    }
  });

  it("contains all major formats", () => {
    const expected = [
      "maven", "npm", "pypi", "cargo", "docker", "helm",
      "go", "nuget", "rubygems", "composer", "terraform",
      "conda", "debian", "rpm", "conan",
    ];
    for (const format of expected) {
      expect(FORMAT_OPTIONS).toContain(format);
    }
  });
});
