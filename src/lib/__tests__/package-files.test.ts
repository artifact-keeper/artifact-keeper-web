import { describe, it, expect } from "vitest";
import {
  encodeGoModulePath,
  packageFilesRootPath,
  repositoryRelativeTreePath,
} from "../package-files";

describe("packageFilesRootPath (#987)", () => {
  it.each([
    // Maven family: groupId:artifactId -> group dirs / artifactId
    ["maven", "com.example:demo", "com/example/demo"],
    ["gradle", "org.junit.jupiter:junit-jupiter-api", "org/junit/jupiter/junit-jupiter-api"],
    ["maven", "single:lib", "single/lib"],
    // npm family: the name is the prefix, scoped names included
    ["npm", "lodash", "lodash"],
    ["npm", "@babel/core", "@babel/core"],
    ["pnpm", "@scope/pkg", "@scope/pkg"],
    // PyPI: the catalog name is the PEP 503 name the path uses
    ["pypi", "my-package", "my-package"],
    ["poetry", "requests", "requests"],
    // Go: uppercase escaped as in the module proxy protocol
    ["go", "github.com/Azure/go-sdk", "github.com/!azure/go-sdk"],
    ["go", "golang.org/x/text", "golang.org/x/text"],
    // OCI family: manifests under v2/<image>
    ["docker", "library/nginx", "v2/library/nginx"],
    ["podman", "team/app", "v2/team/app"],
    ["helm_oci", "charts/nginx", "v2/charts/nginx"],
    // NuGet: name keeps its case, the path is lowercased
    ["nuget", "Newtonsoft.Json", "newtonsoft.json"],
    ["chocolatey", "GoogleChrome", "googlechrome"],
    // scope.name / publisher.name -> scope/name
    ["swift", "apple.swift-nio", "apple/swift-nio"],
    ["vscode", "ms-python.python", "ms-python/python"],
    // modules/<name>
    ["bazel", "rules_go", "modules/rules_go"],
    ["protobuf", "acme/petapis", "modules/acme/petapis"],
    // Conan: user/channel live below the version
    ["conan", "zlib@demo/stable", "zlib"],
    ["conan", "zlib", "zlib"],
    // Name already is the prefix
    ["cargo", "serde", "serde"],
    ["helm", "nginx", "nginx"],
    ["composer", "vendor/pkg", "vendor/pkg"],
    ["terraform", "hashicorp/consul/aws", "hashicorp/consul/aws"],
    ["sbt", "com.example/mylib", "com.example/mylib"],
    ["generic", "tools", "tools"],
    ["unknown-format", "thing", "thing"],
  ])("%s %s -> %s", (format, name, expected) => {
    expect(packageFilesRootPath(format, name)).toBe(expected);
  });

  it("never returns a leading or trailing slash", () => {
    expect(packageFilesRootPath("npm", "/lodash/")).toBe("lodash");
    expect(packageFilesRootPath(undefined, "/thing")).toBe("thing");
  });

  it.each(["rpm", "debian", "conda", "conda_native", "alpine", "pacman"])(
    "%s has no per-package directory",
    (format) => {
      expect(packageFilesRootPath(format, "anything")).toBeNull();
    },
  );

  it("is case-insensitive on the format and rejects an empty name", () => {
    expect(packageFilesRootPath("MAVEN", "a.b:c")).toBe("a/b/c");
    expect(packageFilesRootPath("npm", "  ")).toBeNull();
  });
});

describe("encodeGoModulePath", () => {
  it("escapes every uppercase letter", () => {
    expect(encodeGoModulePath("github.com/BurntSushi/TOML")).toBe(
      "github.com/!burnt!sushi/!t!o!m!l",
    );
  });
});

describe("repositoryRelativeTreePath", () => {
  it("strips the repository key the tree endpoint prepends", () => {
    expect(repositoryRelativeTreePath("maven-releases", "maven-releases/com/example")).toBe(
      "com/example",
    );
    expect(repositoryRelativeTreePath("maven-releases", "maven-releases")).toBe("");
    expect(repositoryRelativeTreePath("maven-releases", "com/example")).toBe("com/example");
    expect(repositoryRelativeTreePath("repo", "repo-other/x")).toBe("repo-other/x");
  });
});
