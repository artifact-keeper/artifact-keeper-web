// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));

vi.mock("@/components/common/copy-button", () => ({
  CopyButton: ({ value }: { value: string }) => (
    <button data-testid="copy-button" data-value={value}>
      Copy
    </button>
  ),
}));

vi.mock("@/components/common/data-table-pagination", () => ({
  DataTablePagination: ({ total }: { total: number }) => (
    <div data-testid="pagination" data-total={total} />
  ),
}));

import { DockerTagList } from "../docker-tag-list";
import type { DockerTag } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures — server-side rollups from `?group_by=docker_tag` (backend ak#1336)
// ---------------------------------------------------------------------------

const FULL_DIGEST =
  "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

function tag(overrides: Partial<DockerTag> & Pick<DockerTag, "id" | "tag">): DockerTag {
  return {
    repository_key: "docker-hub",
    image: "library/node",
    manifest_digest: FULL_DIGEST,
    total_size_bytes: 50_000_000,
    layer_count: 0,
    is_index: false,
    last_pushed_at: "2026-04-10T12:00:00Z",
    scan_status: undefined,
    ...overrides,
  };
}

const TAG_14 = tag({ id: "tag14", tag: "14" });
const TAG_LATEST = tag({
  id: "taglatest",
  tag: "latest",
  manifest_digest:
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DockerTagList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  // -------------------------------------------------------------------------
  // Loading / empty
  // -------------------------------------------------------------------------

  it("renders skeletons when loading", () => {
    render(<DockerTagList tags={[]} loading />);
    expect(screen.getByTestId("docker-tag-list-loading")).toBeInTheDocument();
  });

  it("renders empty state when no tags are present", () => {
    render(<DockerTagList tags={[]} />);
    expect(screen.getByTestId("docker-tag-list-empty")).toBeInTheDocument();
    expect(screen.getByText(/no image tags found/i)).toBeInTheDocument();
  });

  it("uses a custom empty message when provided", () => {
    render(<DockerTagList tags={[]} emptyMessage="Nothing here." />);
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Tag rows
  // -------------------------------------------------------------------------

  it("renders one row per tag", () => {
    render(<DockerTagList tags={[TAG_14, TAG_LATEST]} />);
    const rows = screen.getAllByTestId("docker-tag-row");
    expect(rows).toHaveLength(2);
  });

  it("renders tag name and image", () => {
    render(<DockerTagList tags={[TAG_14]} />);
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("library/node")).toBeInTheDocument();
  });

  it("displays a TRUNCATED digest (sha256:<12 chars>), never the full digest", () => {
    render(<DockerTagList tags={[TAG_14]} />);
    expect(screen.queryByText(FULL_DIGEST)).not.toBeInTheDocument();
    expect(screen.getByText("sha256:abcdef123456")).toBeInTheDocument();
  });

  it("provides a copy button carrying the full digest", () => {
    render(<DockerTagList tags={[TAG_14]} />);
    const copyBtn = screen.getByTestId("copy-button");
    expect(copyBtn).toHaveAttribute("data-value", FULL_DIGEST);
  });

  it("renders the server-computed total size in human-readable form (MB)", () => {
    render(<DockerTagList tags={[TAG_14]} />);
    // formatBytes(50_000_000) ≈ "47.68 MB" / "50 MB"
    expect(screen.getByText(/MB/i)).toBeInTheDocument();
  });

  it("renders the last-pushed date for each tag", () => {
    render(<DockerTagList tags={[TAG_14]} />);
    // toLocaleDateString of 2026-04-10
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(1);
  });

  it("marks multi-arch (image index) tags with a badge", () => {
    render(<DockerTagList tags={[tag({ id: "idx", tag: "v2", is_index: true })]} />);
    expect(screen.getByText("multi-arch")).toBeInTheDocument();
  });

  it("does NOT render the multi-arch badge for single-platform tags", () => {
    render(<DockerTagList tags={[TAG_14]} />);
    expect(screen.queryByText("multi-arch")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Scan status rollup
  // -------------------------------------------------------------------------

  it("renders the scan rollup status when present", () => {
    render(
      <DockerTagList
        tags={[tag({ id: "scanned", tag: "1.0", scan_status: "completed" })]}
      />,
    );
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("renders 'not scanned' when the tag has never been scanned", () => {
    render(<DockerTagList tags={[TAG_14]} />);
    expect(screen.getByText("not scanned")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  it("renders server-side pagination when a total is supplied", () => {
    render(<DockerTagList tags={[TAG_14]} total={137} />);
    expect(screen.getByTestId("pagination")).toHaveAttribute("data-total", "137");
  });

  it("omits pagination when no total is supplied", () => {
    render(<DockerTagList tags={[TAG_14]} />);
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Click handlers
  // -------------------------------------------------------------------------

  it("invokes onTagClick with the tag rollup when a tag is clicked", async () => {
    const onTagClick = vi.fn();
    render(<DockerTagList tags={[TAG_14]} onTagClick={onTagClick} />);
    await userEvent.click(screen.getByText("14"));
    expect(onTagClick).toHaveBeenCalledTimes(1);
    expect(onTagClick).toHaveBeenCalledWith(TAG_14);
  });

  it("renders a Scan button only when onScan is supplied", () => {
    const { rerender } = render(<DockerTagList tags={[TAG_14]} />);
    expect(
      screen.queryByRole("button", { name: /scan library\/node:14/i }),
    ).not.toBeInTheDocument();

    const onScan = vi.fn();
    rerender(<DockerTagList tags={[TAG_14]} onScan={onScan} />);
    expect(
      screen.getByRole("button", { name: /scan library\/node:14/i }),
    ).toBeInTheDocument();
  });

  it("invokes onScan with the tag rollup when the Scan button is clicked", async () => {
    const onScan = vi.fn();
    render(<DockerTagList tags={[TAG_14]} onScan={onScan} />);
    await userEvent.click(
      screen.getByRole("button", { name: /scan library\/node:14/i }),
    );
    expect(onScan).toHaveBeenCalledWith(TAG_14);
  });

  it("disables the Scan button while scanPending=true", () => {
    render(<DockerTagList tags={[TAG_14]} onScan={vi.fn()} scanPending />);
    expect(
      screen.getByRole("button", { name: /scan library\/node:14/i }),
    ).toBeDisabled();
  });
});
