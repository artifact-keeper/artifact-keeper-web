import { describe, it, expect } from "vitest";
import {
  buildMavenSearchQuery,
  groupIdToPath,
  mavenFilePath,
  isPomFile,
  findPomFile,
  parseMavenFilename,
  parseMavenGav,
  mavenGavcFromMetadata,
  parseMavenPackageName,
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

describe("parseMavenFilename", () => {
  it("parses a plain artifact with no classifier", () => {
    expect(parseMavenFilename("lib-1.0.jar", "lib", "1.0")).toEqual({
      extension: "jar",
    });
  });

  it("recovers the classifier from a classified artifact", () => {
    expect(
      parseMavenFilename("examplelib-1.0-sources.jar", "examplelib", "1.0"),
    ).toEqual({ classifier: "sources", extension: "jar" });
  });

  it("keeps compound extensions whole (.tar.gz)", () => {
    expect(parseMavenFilename("lib-1.0.tar.gz", "lib", "1.0")).toEqual({
      extension: "tar.gz",
    });
    expect(parseMavenFilename("lib-1.0-bin.tar.gz", "lib", "1.0")).toEqual({
      classifier: "bin",
      extension: "tar.gz",
    });
  });

  it("treats signature/checksum suffixes as extension, not classifier", () => {
    expect(parseMavenFilename("lib-1.0.jar.asc", "lib", "1.0")).toEqual({
      extension: "jar.asc",
    });
    expect(parseMavenFilename("lib-1.0.jar.sha256", "lib", "1.0")).toEqual({
      extension: "jar.sha256",
    });
    expect(parseMavenFilename("lib-1.0-sources.jar.sha1", "lib", "1.0")).toEqual({
      classifier: "sources",
      extension: "jar.sha1",
    });
  });

  it("handles versions that contain dots and dashes", () => {
    expect(
      parseMavenFilename("lib-2.0-SNAPSHOT-javadoc.jar", "lib", "2.0-SNAPSHOT"),
    ).toEqual({ classifier: "javadoc", extension: "jar" });
  });

  it("returns undefined when the filename does not match the GAV prefix", () => {
    expect(
      parseMavenFilename("other-1.0.jar", "lib", "1.0"),
    ).toBeUndefined();
    // Timestamped snapshot filename against a -SNAPSHOT version.
    expect(
      parseMavenFilename("lib-1.0-20240101.123456-1.jar", "lib", "1.0-SNAPSHOT"),
    ).toBeUndefined();
    // No extension at all.
    expect(parseMavenFilename("lib-1.0", "lib", "1.0")).toBeUndefined();
    expect(parseMavenFilename("lib-1.0-", "lib", "1.0")).toBeUndefined();
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
      extension: "jar",
    });
  });

  it("recovers classifier and extension from the filename (#482)", () => {
    expect(
      parseMavenGav("com/example/examplelib/1.0/examplelib-1.0-sources.jar"),
    ).toEqual({
      groupId: "com.example",
      artifactId: "examplelib",
      version: "1.0",
      classifier: "sources",
      extension: "jar",
    });
    expect(
      parseMavenGav("com/example/lib/1.0/lib-1.0.tar.gz"),
    ).toEqual({
      groupId: "com.example",
      artifactId: "lib",
      version: "1.0",
      extension: "tar.gz",
    });
  });

  it("tolerates a leading slash", () => {
    expect(
      parseMavenGav("/com/example/lib/1.0/lib-1.0.jar"),
    ).toEqual({
      groupId: "com.example",
      artifactId: "lib",
      version: "1.0",
      extension: "jar",
    });
  });

  it("returns undefined for non-Maven paths", () => {
    expect(parseMavenGav("lib.jar")).toBeUndefined();
    expect(parseMavenGav("a/b/c")).toBeUndefined();
  });
});

describe("mavenGavcFromMetadata", () => {
  it("reads the backend-parsed GAVC from artifact metadata (#482)", () => {
    expect(
      mavenGavcFromMetadata({
        groupId: "com.example",
        artifactId: "examplelib",
        version: "1.0",
        classifier: "sources",
        extension: "jar",
      }),
    ).toEqual({
      groupId: "com.example",
      artifactId: "examplelib",
      version: "1.0",
      classifier: "sources",
      extension: "jar",
    });
  });

  it("omits absent classifier/extension", () => {
    expect(
      mavenGavcFromMetadata({
        groupId: "com.example",
        artifactId: "lib",
        version: "1.0",
      }),
    ).toEqual({ groupId: "com.example", artifactId: "lib", version: "1.0" });
  });

  it("returns undefined when metadata is missing or not Maven-shaped", () => {
    expect(mavenGavcFromMetadata(undefined)).toBeUndefined();
    expect(mavenGavcFromMetadata({})).toBeUndefined();
    expect(
      mavenGavcFromMetadata({ groupId: "com.example", artifactId: "lib" }),
    ).toBeUndefined();
    expect(
      mavenGavcFromMetadata({
        groupId: 42,
        artifactId: "lib",
        version: "1.0",
      }),
    ).toBeUndefined();
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

  it("includes a <classifier> element when the coordinate has one (#482)", () => {
    expect(
      buildPomDependencySnippet({
        groupId: "com.example",
        artifactId: "examplelib",
        version: "1.0",
        classifier: "sources",
      }),
    ).toBe(
      [
        "<dependency>",
        "  <groupId>com.example</groupId>",
        "  <artifactId>examplelib</artifactId>",
        "  <version>1.0</version>",
        "  <classifier>sources</classifier>",
        "</dependency>",
      ].join("\n"),
    );
  });
});

describe("parseMavenPackageName", () => {
  it("splits a colon-joined groupId:artifactId name", () => {
    expect(parseMavenPackageName("com.example.team:team-spring-archetype")).toEqual({
      groupId: "com.example.team",
      artifactId: "team-spring-archetype",
      version: undefined,
    });
  });

  it("splits on colons, never on dots (dotted artifactId survives)", () => {
    expect(parseMavenPackageName("org.foo:bar.baz")).toEqual({
      groupId: "org.foo",
      artifactId: "bar.baz",
      version: undefined,
    });
  });

  it("parses a full groupId:artifactId:version coordinate", () => {
    expect(parseMavenPackageName("com.acme.sub:my-artifact:1.0")).toEqual({
      groupId: "com.acme.sub",
      artifactId: "my-artifact",
      version: "1.0",
    });
    expect(parseMavenPackageName("org.foo:bar.baz:2.0-SNAPSHOT")).toEqual({
      groupId: "org.foo",
      artifactId: "bar.baz",
      version: "2.0-SNAPSHOT",
    });
  });

  it("treats a colon-free name as a bare artifactId", () => {
    expect(parseMavenPackageName("plain-name")).toEqual({
      artifactId: "plain-name",
    });
  });

  it("falls back to the whole name when a colon segment is empty", () => {
    expect(parseMavenPackageName(":oops")).toEqual({ artifactId: ":oops" });
    expect(parseMavenPackageName("oops:")).toEqual({ artifactId: "oops:" });
  });
});
