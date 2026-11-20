// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { BuildArtifactName } from "../build-artifact-name";

afterEach(cleanup);

const entry = { name: "app.jar", path: "libs/app.jar", checksum_sha256: "c", size_bytes: 1 };

describe("BuildArtifactName", () => {
  it("prints a free-form entry as text", () => {
    render(<BuildArtifactName artifact={entry} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("app.jar")).toBeTruthy();
  });

  it("links a stored artifact to its repository and names it", () => {
    render(
      <BuildArtifactName
        artifact={{ ...entry, artifact_id: "a-1", repository_key: "maven-releases" }}
      />,
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("/repositories/maven-releases");
    expect(screen.getByText("maven-releases")).toBeTruthy();
    expect(screen.getByRole("link", { name: "app.jar, open repository maven-releases" })).toBeTruthy();
  });

  it("prints a link the caller can't see into as text", () => {
    render(<BuildArtifactName artifact={{ ...entry, artifact_id: "a-1" }} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says when the linked artifact is in the trash, without a link", () => {
    render(
      <BuildArtifactName
        artifact={{ ...entry, artifact_id: "a-1", repository_key: "r", artifact_deleted: true }}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("in trash")).toBeTruthy();
  });
});
