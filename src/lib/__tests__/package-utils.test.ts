import { describe, it, expect } from "vitest";
import { getInstallCommand, FORMAT_OPTIONS } from "../package-utils";

describe("getInstallCommand", () => {
  const pkg = "my-package";
  const ver = "1.2.3";

  describe("npm/yarn/pnpm (JavaScript)", () => {
    it("returns npm install for npm format", () => {
      expect(getInstallCommand(pkg, ver, "npm")).toBe("npm install my-package@1.2.3");
    });

    it("returns npm install for yarn format", () => {
      expect(getInstallCommand(pkg, ver, "yarn")).toBe("npm install my-package@1.2.3");
    });

    it("returns npm install for pnpm format", () => {
      expect(getInstallCommand(pkg, ver, "pnpm")).toBe("npm install my-package@1.2.3");
    });
  });

  describe("pypi/poetry (Python)", () => {
    it("returns pip install for pypi", () => {
      expect(getInstallCommand(pkg, ver, "pypi")).toBe("pip install my-package==1.2.3");
    });

    it("returns pip install for poetry", () => {
      expect(getInstallCommand(pkg, ver, "poetry")).toBe("pip install my-package==1.2.3");
    });
  });

  describe("maven/gradle/sbt (JVM)", () => {
    it("returns XML dependency for maven", () => {
      const result = getInstallCommand(pkg, ver, "maven");
      expect(result).toContain("<dependency>");
      expect(result).toContain(`<artifactId>${pkg}</artifactId>`);
      expect(result).toContain(`<version>${ver}</version>`);
    });

    it("returns XML dependency for gradle", () => {
      const result = getInstallCommand(pkg, ver, "gradle");
      expect(result).toContain("<dependency>");
    });

    it("returns XML dependency for sbt", () => {
      const result = getInstallCommand(pkg, ver, "sbt");
      expect(result).toContain("<dependency>");
    });
  });

  describe("cargo (Rust)", () => {
    it("returns cargo add command", () => {
      expect(getInstallCommand(pkg, ver, "cargo")).toBe("cargo add my-package@1.2.3");
    });
  });

  describe("nuget (.NET)", () => {
    it("returns dotnet add package command", () => {
      expect(getInstallCommand(pkg, ver, "nuget")).toBe(
        "dotnet add package my-package --version 1.2.3"
      );
    });
  });

  describe("go", () => {
    it("returns go get command with v prefix", () => {
      expect(getInstallCommand(pkg, ver, "go")).toBe("go get my-package@v1.2.3");
    });
  });

  describe("rubygems", () => {
    it("returns gem install command", () => {
      expect(getInstallCommand(pkg, ver, "rubygems")).toBe("gem install my-package -v 1.2.3");
    });
  });

  describe("docker/podman/buildx (container images)", () => {
    it("returns docker pull for docker", () => {
      expect(getInstallCommand(pkg, ver, "docker")).toBe("docker pull my-package:1.2.3");
    });

    it("returns docker pull for podman", () => {
      expect(getInstallCommand(pkg, ver, "podman")).toBe("docker pull my-package:1.2.3");
    });

    it("returns docker pull for buildx", () => {
      expect(getInstallCommand(pkg, ver, "buildx")).toBe("docker pull my-package:1.2.3");
    });
  });

  describe("incus/lxc (container images)", () => {
    it("returns incus image copy for incus", () => {
      expect(getInstallCommand(pkg, ver, "incus")).toContain("incus image copy");
    });

    it("returns incus image copy for lxc", () => {
      expect(getInstallCommand(pkg, ver, "lxc")).toContain("incus image copy");
    });
  });

  describe("helm/helm_oci", () => {
    it("returns helm install for helm", () => {
      expect(getInstallCommand(pkg, ver, "helm")).toBe(
        "helm install my-package --version 1.2.3"
      );
    });

    it("returns helm install for helm_oci", () => {
      expect(getInstallCommand(pkg, ver, "helm_oci")).toBe(
        "helm install my-package --version 1.2.3"
      );
    });
  });

  describe("composer (PHP)", () => {
    it("returns composer require command", () => {
      expect(getInstallCommand(pkg, ver, "composer")).toBe("composer require my-package:1.2.3");
    });
  });

  describe("hex (Elixir)", () => {
    it("returns mix deps.get command", () => {
      expect(getInstallCommand(pkg, ver, "hex")).toBe("mix deps.get my-package 1.2.3");
    });
  });

  describe("cocoapods", () => {
    it("returns pod specification", () => {
      expect(getInstallCommand(pkg, ver, "cocoapods")).toBe("pod 'my-package', '1.2.3'");
    });
  });

  describe("swift", () => {
    it("returns Swift Package Manager dependency", () => {
      expect(getInstallCommand(pkg, ver, "swift")).toBe(
        '.package(url: "my-package", from: "1.2.3")'
      );
    });
  });

  describe("terraform/opentofu", () => {
    it("returns terraform block for terraform", () => {
      const result = getInstallCommand(pkg, ver, "terraform");
      expect(result).toContain("terraform {");
      expect(result).toContain("required_providers");
      expect(result).toContain(`version = "${ver}"`);
    });

    it("returns terraform block for opentofu", () => {
      const result = getInstallCommand(pkg, ver, "opentofu");
      expect(result).toContain("required_providers");
    });
  });

  describe("conda/conda_native", () => {
    it("returns conda install for conda", () => {
      expect(getInstallCommand(pkg, ver, "conda")).toBe("conda install my-package=1.2.3");
    });

    it("returns conda install for conda_native", () => {
      expect(getInstallCommand(pkg, ver, "conda_native")).toBe(
        "conda install my-package=1.2.3"
      );
    });
  });

  describe("alpine", () => {
    it("returns apk add command", () => {
      expect(getInstallCommand(pkg, ver, "alpine")).toBe("apk add my-package=1.2.3");
    });
  });

  describe("pub (Dart/Flutter)", () => {
    it("returns dart pub add command", () => {
      expect(getInstallCommand(pkg, ver, "pub")).toBe("dart pub add my-package:1.2.3");
    });
  });

  describe("ansible", () => {
    it("returns ansible-galaxy command", () => {
      expect(getInstallCommand(pkg, ver, "ansible")).toBe(
        "ansible-galaxy collection install my-package:1.2.3"
      );
    });
  });

  describe("cran (R)", () => {
    it("returns install.packages command", () => {
      expect(getInstallCommand(pkg, ver, "cran")).toBe('install.packages("my-package")');
    });
  });

  describe("vagrant", () => {
    it("returns vagrant box add command", () => {
      expect(getInstallCommand(pkg, ver, "vagrant")).toBe(
        "vagrant box add my-package --box-version 1.2.3"
      );
    });
  });

  describe("puppet", () => {
    it("returns puppet module install command", () => {
      expect(getInstallCommand(pkg, ver, "puppet")).toBe(
        "puppet module install my-package --version 1.2.3"
      );
    });
  });

  describe("chef", () => {
    it("returns knife supermarket install command", () => {
      expect(getInstallCommand(pkg, ver, "chef")).toBe(
        "knife supermarket install my-package 1.2.3"
      );
    });
  });

  describe("conan (C/C++)", () => {
    it("returns conan install command", () => {
      expect(getInstallCommand(pkg, ver, "conan")).toBe("conan install my-package/1.2.3@");
    });
  });

  describe("vscode", () => {
    it("returns code --install-extension command", () => {
      expect(getInstallCommand(pkg, ver, "vscode")).toBe(
        "code --install-extension my-package@1.2.3"
      );
    });
  });

  describe("jetbrains", () => {
    it("returns download instruction", () => {
      expect(getInstallCommand(pkg, ver, "jetbrains")).toBe("Download my-package v1.2.3");
    });
  });

  describe("chocolatey", () => {
    it("returns choco install command", () => {
      expect(getInstallCommand(pkg, ver, "chocolatey")).toBe(
        "choco install my-package --version 1.2.3"
      );
    });
  });

  describe("powershell", () => {
    it("returns Install-Module command", () => {
      expect(getInstallCommand(pkg, ver, "powershell")).toBe(
        "Install-Module my-package -RequiredVersion 1.2.3"
      );
    });
  });

  describe("huggingface", () => {
    it("returns huggingface-cli download command", () => {
      expect(getInstallCommand(pkg, ver, "huggingface")).toBe(
        "huggingface-cli download my-package"
      );
    });
  });

  describe("bazel", () => {
    it("returns bazel_dep declaration", () => {
      expect(getInstallCommand(pkg, ver, "bazel")).toBe(
        'bazel_dep(name = "my-package", version = "1.2.3")'
      );
    });
  });

  describe("rpm", () => {
    it("returns rpm -i command", () => {
      expect(getInstallCommand(pkg, ver, "rpm")).toBe("rpm -i my-package-1.2.3.rpm");
    });
  });

  describe("debian", () => {
    it("returns apt-get install command", () => {
      expect(getInstallCommand(pkg, ver, "debian")).toBe("apt-get install my-package=1.2.3");
    });
  });

  describe("oras/wasm_oci", () => {
    it("returns oras pull for oras", () => {
      expect(getInstallCommand(pkg, ver, "oras")).toBe("oras pull my-package:1.2.3");
    });

    it("returns oras pull for wasm_oci", () => {
      expect(getInstallCommand(pkg, ver, "wasm_oci")).toBe("oras pull my-package:1.2.3");
    });
  });

  describe("bower", () => {
    it("returns bower install command", () => {
      expect(getInstallCommand(pkg, ver, "bower")).toBe("bower install my-package#1.2.3");
    });
  });

  describe("gitlfs", () => {
    it("returns git lfs pull command", () => {
      expect(getInstallCommand(pkg, ver, "gitlfs")).toBe("git lfs pull my-package");
    });
  });

  describe("mlmodel", () => {
    it("returns download instruction", () => {
      expect(getInstallCommand(pkg, ver, "mlmodel")).toBe("Download my-package v1.2.3");
    });
  });

  describe("opkg", () => {
    it("returns opkg install command", () => {
      expect(getInstallCommand(pkg, ver, "opkg")).toBe("opkg install my-package");
    });
  });

  describe("p2", () => {
    it("returns download instruction", () => {
      expect(getInstallCommand(pkg, ver, "p2")).toBe("Download my-package v1.2.3");
    });
  });

  describe("protobuf", () => {
    it("returns download instruction", () => {
      expect(getInstallCommand(pkg, ver, "protobuf")).toBe("Download my-package v1.2.3");
    });
  });

  describe("unknown format", () => {
    it("returns a generic download instruction", () => {
      expect(getInstallCommand(pkg, ver, "unknown-format")).toBe("Download my-package v1.2.3");
    });
  });

  describe("undefined version falls back to 'latest'", () => {
    it("uses 'latest' when version is undefined", () => {
      expect(getInstallCommand(pkg, undefined, "npm")).toBe("npm install my-package@latest");
    });

    it("uses 'latest' for docker when version is undefined", () => {
      expect(getInstallCommand(pkg, undefined, "docker")).toBe(
        "docker pull my-package:latest"
      );
    });
  });
});

describe("FORMAT_OPTIONS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(FORMAT_OPTIONS)).toBe(true);
    expect(FORMAT_OPTIONS.length).toBeGreaterThan(0);
  });

  it("contains only strings", () => {
    for (const option of FORMAT_OPTIONS) {
      expect(typeof option).toBe("string");
    }
  });

  it("contains all major formats", () => {
    const expectedFormats = [
      "maven",
      "npm",
      "pypi",
      "cargo",
      "docker",
      "helm",
      "go",
      "nuget",
      "rubygems",
      "composer",
      "terraform",
      "conda",
      "debian",
      "rpm",
      "conan",
    ];
    for (const format of expectedFormats) {
      expect(FORMAT_OPTIONS).toContain(format);
    }
  });

  it("has no duplicates", () => {
    const unique = new Set(FORMAT_OPTIONS);
    expect(unique.size).toBe(FORMAT_OPTIONS.length);
  });
});
