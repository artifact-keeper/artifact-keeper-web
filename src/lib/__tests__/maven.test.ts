import { describe, it, expect } from "vitest";
import {
  buildMavenSearchQuery,
  groupIdToPath,
  mavenFilePath,
  isPomFile,
  findPomFile,
  parseMavenGav,
  buildPomDependencySnippet,
} from "../maven";

describe("buildMavenSearchQuery", () => {
  it("joins all supplied fields with spaces", () => {
    expect(
      buildMavenSearchQuery({
        groupId: "org.junit.jupiter",
        artifactId: "junit-jupiter-api",
        version: "5.11.0",
        classifier: "sources",
        extension: "jar",
      }),
    ).toBe("org.junit.jupiter junit-jupiter-api 5.11.0 sources jar");
  });

  it("skips empty and whitespace-only fields", () => {
    expect(
      buildMavenSearchQuery({
        groupId: "com.example",
        artifactId: "",
        version: "   ",
        classifier: undefined,
      }),
    ).toBe("com.example");
  });

  it("trims surrounding whitespace from each field", () => {
    expect(
      buildMavenSearchQuery({ groupId: "  com.example  ", artifactId: " lib " }),
    ).toBe("com.example lib");
  });

  it("strips a leading dot from the extension", () => {
    expect(buildMavenSearchQuery({ artifactId: "lib", extension: ".pom" })).toBe(
      "lib pom",
    );
  });

  it("returns an empty string when nothing is supplied", () => {
    expect(buildMavenSearchQuery({})).toBe("");
  });
});

describe("groupIdToPath", () => {
  it("replaces dots with slashes", () => {
    expect(groupIdToPath("org.junit.jupiter")).toBe("org/junit/jupiter");
  });

  it("drops empty segments", () => {
    expect(groupIdToPath("com..example.")).toBe("com/example");
  });
});

describe("mavenFilePath", () => {
  it("builds the repository-relative path from the GAV layout", () => {
    expect(
      mavenFilePath(
        {
          group_id: "org.junit.jupiter",
          artifact_id: "junit-jupiter-api",
          version: "5.11.0",
        },
        "junit-jupiter-api-5.11.0.pom",
      ),
    ).toBe(
      "org/junit/jupiter/junit-jupiter-api/5.11.0/junit-jupiter-api-5.11.0.pom",
    );
  });
});

describe("isPomFile", () => {
  it("matches .pom files case-insensitively", () => {
    expect(isPomFile("lib-1.0.pom")).toBe(true);
    expect(isPomFile("lib-1.0.POM")).toBe(true);
  });

  it("rejects jars, checksums, and signatures", () => {
    expect(isPomFile("lib-1.0.jar")).toBe(false);
    expect(isPomFile("lib-1.0.pom.sha1")).toBe(false);
    expect(isPomFile("lib-1.0.pom.asc")).toBe(false);
  });
});

describe("findPomFile", () => {
  it("returns the POM filename when present", () => {
    expect(
      findPomFile(["lib-1.0.jar", "lib-1.0.pom", "lib-1.0.pom.sha1"]),
    ).toBe("lib-1.0.pom");
  });

  it("returns undefined when no POM is present", () => {
    expect(findPomFile(["lib-1.0.jar", "lib-1.0.jar.sha1"])).toBeUndefined();
  });
});

describe("parseMavenGav", () => {
  it("parses a standard Maven layout path", () => {
    expect(
      parseMavenGav(
        "org/junit/jupiter/junit-jupiter-api/5.11.0/junit-jupiter-api-5.11.0.jar",
      ),
    ).toEqual({
      groupId: "org.junit.jupiter",
      artifactId: "junit-jupiter-api",
      version: "5.11.0",
    });
  });

  it("tolerates a leading slash", () => {
    expect(
      parseMavenGav("/com/example/lib/1.0/lib-1.0.jar"),
    ).toEqual({ groupId: "com.example", artifactId: "lib", version: "1.0" });
  });

  it("returns undefined for non-Maven paths", () => {
    expect(parseMavenGav("lib.jar")).toBeUndefined();
    expect(parseMavenGav("a/b/c")).toBeUndefined();
  });
});

describe("buildPomDependencySnippet", () => {
  it("renders a dependency block", () => {
    expect(
      buildPomDependencySnippet({
        groupId: "org.junit.jupiter",
        artifactId: "junit-jupiter-api",
        version: "5.11.0",
      }),
    ).toBe(
      [
        "<dependency>",
        "  <groupId>org.junit.jupiter</groupId>",
        "  <artifactId>junit-jupiter-api</artifactId>",
        "  <version>5.11.0</version>",
        "</dependency>",
      ].join("\n"),
    );
  });
});
