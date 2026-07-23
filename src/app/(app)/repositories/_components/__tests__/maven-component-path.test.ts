import { describe, it, expect } from "vitest";

import { mavenFilePath } from "../maven-component-path";

describe("mavenFilePath", () => {
  it("maps dotted groupId to a slash path and appends artifact/version/filename", () => {
    expect(
      mavenFilePath(
        { group_id: "org.junit.jupiter", artifact_id: "junit-jupiter-api", version: "5.11.0" },
        "junit-jupiter-api-5.11.0.jar",
      ),
    ).toBe("org/junit/jupiter/junit-jupiter-api/5.11.0/junit-jupiter-api-5.11.0.jar");
  });

  it("handles a single-segment groupId", () => {
    expect(
      mavenFilePath(
        { group_id: "example", artifact_id: "demo", version: "1.0.0" },
        "demo-1.0.0.zip",
      ),
    ).toBe("example/demo/1.0.0/demo-1.0.0.zip");
  });

  it("preserves non-jar file extensions such as .zip and checksum files", () => {
    expect(
      mavenFilePath(
        { group_id: "com.example", artifact_id: "lib", version: "2.0.0" },
        "lib-2.0.0.zip",
      ),
    ).toBe("com/example/lib/2.0.0/lib-2.0.0.zip");
    expect(
      mavenFilePath(
        { group_id: "com.example", artifact_id: "lib", version: "2.0.0" },
        "lib-2.0.0.pom.sha512",
      ),
    ).toBe("com/example/lib/2.0.0/lib-2.0.0.pom.sha512");
  });
});
