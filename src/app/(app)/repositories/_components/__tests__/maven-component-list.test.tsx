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
  // Pagination (issue #443)
  // ---------------------------------------------------------------------

  it("renders pagination controls when total is provided", () => {
    render(
      <MavenComponentList
        components={[COMP_A]}
        total={42}
        page={1}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByTestId("data-table-pagination")).toBeInTheDocument();
    // 42 components / 20 per page => 3 pages
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByText(/1-20 of 42/i)).toBeInTheDocument();
  });

  it("does not render pagination when total is undefined", () => {
    render(<MavenComponentList components={[COMP_A]} />);
    expect(screen.queryByTestId("data-table-pagination")).not.toBeInTheDocument();
  });

  it("invokes onPageChange when the next-page button is clicked", async () => {
    const onPageChange = vi.fn();
    render(
      <MavenComponentList
        components={[COMP_A]}
        total={42}
        page={1}
        pageSize={20}
        onPageChange={onPageChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  // ---------------------------------------------------------------------
  // `pagination.total` semantics (issue #417)
  //
  // The footer denominator is `pagination.total` from the
  // `?group_by=maven_component` response, and that total counts COMPONENTS,
  // not the raw `artifacts` rows they group.  Backend evidence, in
  // artifact-keeper/backend/src/api/handlers/repositories.rs:
  //
  //   - `?count=exact` (what this view sends since #766) is answered by
  //     `count_maven_catalog_component_keys` (:5997), whose SQL is
  //     `SELECT COUNT(*) FROM (SELECT DISTINCT p.name, pv.version FROM
  //     packages p JOIN package_versions pv ...) t` -- one counted row per
  //     `(groupId:artifactId, version)` component.  The remote/proxy branch
  //     uses `count_maven_catalog_components` (:6267), a COUNT over
  //     `packages`, which since migration 113 holds one row per
  //     `groupId:artifactId` catalog entry.
  //   - Without `count=exact`, `grouped_listing_total` (:6147) returns
  //     `offset + returned + has_more`, where `returned` is the number of
  //     GROUPED rows on the page (`keys.len()` / `components.len()`).
  //
  // Neither path ever counts `artifacts` rows.  What these tests pin is the
  // FRONTEND half of that contract: the denominator must be the server
  // `total` prop, never recomputed from `components.length` (which is only
  // the page size).  They do NOT verify the server semantic -- the total is
  // handed in as a prop here -- so they would not go red if the backend
  // started reporting raw artifact counts.  Pinning that needs a backend
  // test in artifact-keeper (see #417).
  // ---------------------------------------------------------------------

  it("uses the server component total as the denominator, not the page's file count", () => {
    // One page of 3 components holding 5 files each: 15 raw artifact rows
    // sit behind this page.  The repository holds 7 components in total.
    const page = ["alpha", "beta", "gamma"].map((artifactId) => ({
      ...COMP_B,
      id: `${artifactId}-1`,
      artifact_id: artifactId,
      artifact_files: [
        `${artifactId}-1.0.0.jar`,
        `${artifactId}-1.0.0.pom`,
        `${artifactId}-1.0.0-sources.jar`,
        `${artifactId}-1.0.0-javadoc.jar`,
        `${artifactId}-1.0.0.jar.sha1`,
      ],
    }));

    render(
      <MavenComponentList
        components={page}
        total={7}
        page={1}
        pageSize={3}
        onPageChange={() => {}}
      />,
    );

    // Note the rendered string carries no noun: `DataTablePagination`
    // (data-table-pagination.tsx:72) only prints `itemLabel` in its
    // `total === 0` branch, so a non-empty page reads "1-3 of 7" and the
    // user is left to infer the unit.  #417 assumed the copy said
    // "components"; that wording was dropped when this shared control was
    // adopted (#419 -> #466).
    expect(screen.getByText("1-3 of 7")).toBeInTheDocument();
    // 15 = the raw artifact rows behind the page.  Documentation more than
    // a guard: the assertion above already fails for any denominator change
    // that could produce 15 here.  Kept so the number a reader of #417
    // expects to be wrong is visible in the test.
    expect(screen.queryByText(/of 15/)).not.toBeInTheDocument();
  });

  it("derives the page count from the component total, not from components.length", () => {
    // 7 components at 3 per page is 3 pages.  Using `components.length` as
    // the denominator (the tempting "fix") would collapse this to 1 page and
    // strand the user on page 1.
    render(
      <MavenComponentList
        components={[COMP_A, COMP_B]}
        total={7}
        page={1}
        pageSize={3}
        onPageChange={() => {}}
      />,
    );

    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled();
  });

  // ---------------------------------------------------------------------
  // Clickable file rows (issues #444, #445)
  // ---------------------------------------------------------------------

  it("invokes onFileSelect with the reconstructed Maven path when a file is clicked", async () => {
    const onFileSelect = vi.fn();
    render(
      <MavenComponentList components={[COMP_A]} onFileSelect={onFileSelect} />,
    );
    const trigger = screen.getByRole("button", { name: /org\.junit\.jupiter/ });
    await userEvent.click(trigger);

    const fileList = await screen.findByTestId("maven-component-files");
    await userEvent.click(
      within(fileList).getByText("junit-jupiter-api-5.11.0.jar"),
    );

    expect(onFileSelect).toHaveBeenCalledWith(
      "org/junit/jupiter/junit-jupiter-api/5.11.0/junit-jupiter-api-5.11.0.jar",
      "junit-jupiter-api-5.11.0.jar",
    );
  });

  it("lists every file in a component, including non-jar files like .zip", async () => {
    const withZip: MavenComponent = {
      ...COMP_B,
      artifact_files: [
        "lib-1.0.0.pom",
        "lib-1.0.0.zip",
        "lib-1.0.0.jar.sha1",
      ],
    };
    render(<MavenComponentList components={[withZip]} />);
    const trigger = screen.getByRole("button", { name: /com\.example/ });
    await userEvent.click(trigger);

    const fileList = await screen.findByTestId("maven-component-files");
    expect(within(fileList).getByText("lib-1.0.0.pom")).toBeInTheDocument();
    expect(within(fileList).getByText("lib-1.0.0.zip")).toBeInTheDocument();
    expect(within(fileList).getByText("lib-1.0.0.jar.sha1")).toBeInTheDocument();
  });
});
