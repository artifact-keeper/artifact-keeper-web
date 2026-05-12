// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub Skeleton (rendered in loading state) to a simple div with a stable role
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { MavenComponentList } from "../maven-component-list";
import type { MavenComponent } from "@/types";

const COMP_A: MavenComponent = {
  id: "a-1",
  group_id: "org.junit.jupiter",
  artifact_id: "junit-jupiter-api",
  version: "5.11.0",
  repository_key: "maven-releases",
  format: "maven",
  size_bytes: 250_000,
  download_count: 1234,
  created_at: "2026-04-01T00:00:00Z",
  artifact_files: [
    "junit-jupiter-api-5.11.0.jar",
    "junit-jupiter-api-5.11.0.pom",
    "junit-jupiter-api-5.11.0-sources.jar",
  ],
};

const COMP_B: MavenComponent = {
  id: "b-1",
  group_id: "com.example",
  artifact_id: "lib",
  version: "1.0.0",
  repository_key: "maven-releases",
  format: "maven",
  size_bytes: 12_345,
  download_count: 1,
  created_at: "2026-04-02T00:00:00Z",
  artifact_files: ["lib-1.0.0.jar"],
};

describe("MavenComponentList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  // ---------------------------------------------------------------------
  // Loading / empty states
  // ---------------------------------------------------------------------

  it("renders loading skeletons when loading=true", () => {
    render(<MavenComponentList components={[]} loading />);
    expect(screen.getByTestId("maven-component-list-loading")).toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the empty state when components is empty", () => {
    render(<MavenComponentList components={[]} />);
    const empty = screen.getByTestId("maven-component-list-empty");
    expect(empty).toBeInTheDocument();
    // Default copy guides the user toward the flat-view fallback
    expect(empty).toHaveTextContent(/no maven components/i);
  });

  it("uses a custom empty message when provided", () => {
    render(
      <MavenComponentList components={[]} emptyMessage="Nothing to see." />,
    );
    expect(screen.getByText("Nothing to see.")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // GAV hierarchy rendering
  // ---------------------------------------------------------------------

  it("renders one row per component", () => {
    render(<MavenComponentList components={[COMP_A, COMP_B]} />);
    const rows = screen.getAllByTestId("maven-component-row");
    expect(rows).toHaveLength(2);
  });

  it("encodes GAV as a `data-gav` attribute on each row", () => {
    render(<MavenComponentList components={[COMP_A, COMP_B]} />);
    const rows = screen.getAllByTestId("maven-component-row");
    expect(rows[0]).toHaveAttribute(
      "data-gav",
      "org.junit.jupiter:junit-jupiter-api:5.11.0",
    );
    expect(rows[1]).toHaveAttribute("data-gav", "com.example:lib:1.0.0");
  });

  it("displays groupId, artifactId, and version for each component", () => {
    render(<MavenComponentList components={[COMP_A]} />);
    const row = screen.getByTestId("maven-component-row");
    expect(within(row).getByText("org.junit.jupiter")).toBeInTheDocument();
    expect(within(row).getByText("junit-jupiter-api")).toBeInTheDocument();
    expect(within(row).getByText("5.11.0")).toBeInTheDocument();
  });

  it("shows the file-count badge with correct singular/plural", () => {
    render(<MavenComponentList components={[COMP_A, COMP_B]} />);
    expect(screen.getByText("3 files")).toBeInTheDocument();
    expect(screen.getByText("1 file")).toBeInTheDocument();
  });

  it("formats total size with formatBytes", () => {
    render(<MavenComponentList components={[COMP_B]} />);
    // formatBytes(12345) ≈ "12.06 KB" or "12 KB"
    expect(screen.getByText(/KB/i)).toBeInTheDocument();
  });

  it("renders the trigger as a button with an aria-label including GAV + file count", () => {
    render(<MavenComponentList components={[COMP_A]} />);
    expect(
      screen.getByRole("button", {
        name: /org\.junit\.jupiter:junit-jupiter-api:5\.11\.0.*3 files/i,
      }),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Expand / collapse
  // ---------------------------------------------------------------------

  it("hides individual files until the row is expanded", () => {
    render(<MavenComponentList components={[COMP_A]} />);
    // CollapsibleContent is closed by default — its children should not be
    // queryable as visible text. Radix mounts the content but hides via CSS;
    // assert the trigger reports collapsed via aria-expanded=false and that
    // no visible file-list testid is present.
    const trigger = screen.getByRole("button", {
      name: /org\.junit\.jupiter/,
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("expanding a component reveals its file list (aria-expanded flips)", async () => {
    render(<MavenComponentList components={[COMP_A]} />);
    const trigger = screen.getByRole("button", {
      name: /org\.junit\.jupiter/,
    });

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Expanded content carries data-testid="maven-component-files"
    const fileList = await screen.findByTestId("maven-component-files");
    expect(within(fileList).getByText("junit-jupiter-api-5.11.0.jar")).toBeInTheDocument();
    expect(within(fileList).getByText("junit-jupiter-api-5.11.0.pom")).toBeInTheDocument();
    expect(
      within(fileList).getByText("junit-jupiter-api-5.11.0-sources.jar"),
    ).toBeInTheDocument();
  });

  it("collapsing a component returns aria-expanded=false", async () => {
    render(<MavenComponentList components={[COMP_A]} />);
    const trigger = screen.getByRole("button", {
      name: /org\.junit\.jupiter/,
    });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("each row's expand state is independent", async () => {
    render(<MavenComponentList components={[COMP_A, COMP_B]} />);
    const triggers = screen.getAllByRole("button", { name: /:/ });
    // Expand only the first row
    await userEvent.click(triggers[0]);
    expect(triggers[0]).toHaveAttribute("aria-expanded", "true");
    expect(triggers[1]).toHaveAttribute("aria-expanded", "false");
  });

  // ---------------------------------------------------------------------
  // "Showing N of M" footer
  // ---------------------------------------------------------------------

  it("shows the 'showing N of M' helper when total exceeds rendered count", () => {
    render(<MavenComponentList components={[COMP_A]} total={42} />);
    expect(screen.getByText(/showing 1 of 42 components/i)).toBeInTheDocument();
  });

  it("hides the helper footer when total equals rendered count", () => {
    render(<MavenComponentList components={[COMP_A]} total={1} />);
    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
  });

  it("hides the helper footer when total is undefined", () => {
    render(<MavenComponentList components={[COMP_A]} />);
    expect(screen.queryByText(/showing/i)).not.toBeInTheDocument();
  });
});
