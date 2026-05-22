// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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

vi.mock("@/components/common/quarantine-badge", () => ({
  QuarantineBadge: () => (
    <span data-testid="quarantine-badge">Quarantined</span>
  ),
}));

import { DockerTagList } from "../docker-tag-list";
import type { Artifact } from "@/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function art(overrides: Partial<Artifact> & Pick<Artifact, "path" | "id">): Artifact {
  return {
    repository_key: "docker-hub",
    name: overrides.path.split("/").pop() ?? overrides.path,
    size_bytes: 4096,
    checksum_sha256: "",
    content_type: "application/vnd.oci.image.manifest.v1+json",
    download_count: 0,
    created_at: "2026-04-10T12:00:00Z",
    ...overrides,
  };
}

const FULL_DIGEST =
  "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

const TAG_14 = art({
  id: "tag14",
  path: "library/node/manifests/14",
  size_bytes: 50_000_000,
  checksum_sha256: FULL_DIGEST,
});

const TAG_LATEST = art({
  id: "taglatest",
  path: "library/node/manifests/latest",
  size_bytes: 50_000_000,
  checksum_sha256:
    "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
});

const DIGEST_MANIFEST = art({
  id: "dgst",
  path: "library/node/manifests/sha256:deadbeefcafebabe1111222233334444555566667777888899990000aaaabbbb",
});

const BLOB_1 = art({
  id: "blob1",
  path: "library/node/blobs/sha256:abcd1234deadbeef0000111122223333444455556666777788889999aaaabbbb",
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
    render(<DockerTagList artifacts={[]} loading />);
    expect(screen.getByTestId("docker-tag-list-loading")).toBeInTheDocument();
  });

  it("renders empty state when no tags are present", () => {
    render(<DockerTagList artifacts={[]} />);
    expect(screen.getByTestId("docker-tag-list-empty")).toBeInTheDocument();
    expect(screen.getByText(/no image tags found/i)).toBeInTheDocument();
  });

  it("uses a custom empty message when provided", () => {
    render(<DockerTagList artifacts={[]} emptyMessage="Nothing here." />);
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("empty state mentions blob/manifest count if any are hidden", () => {
    render(<DockerTagList artifacts={[BLOB_1, DIGEST_MANIFEST]} />);
    // Empty (no tags) but the empty container should report the hidden count
    const empty = screen.getByTestId("docker-tag-list-empty");
    expect(empty).toHaveTextContent(/2.*blob/i);
    expect(empty).toHaveTextContent(/manifest/i);
  });

  // -------------------------------------------------------------------------
  // Tag rows
  // -------------------------------------------------------------------------

  it("renders one row per tag", () => {
    render(<DockerTagList artifacts={[TAG_14, TAG_LATEST]} />);
    const rows = screen.getAllByTestId("docker-tag-row");
    expect(rows).toHaveLength(2);
  });

  it("renders tag name and image", () => {
    render(<DockerTagList artifacts={[TAG_14]} />);
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("library/node")).toBeInTheDocument();
  });

  it("displays a TRUNCATED digest (sha256:<12 chars>), never the full digest", () => {
    render(<DockerTagList artifacts={[TAG_14]} />);
    expect(screen.queryByText(FULL_DIGEST)).not.toBeInTheDocument();
    expect(screen.getByText("sha256:abcdef123456")).toBeInTheDocument();
  });

  it("provides a copy button carrying the full digest", () => {
    render(<DockerTagList artifacts={[TAG_14]} />);
    const copyBtn = screen.getByTestId("copy-button");
    expect(copyBtn).toHaveAttribute("data-value", FULL_DIGEST);
  });

  it("renders the size in human-readable form (MB)", () => {
    render(<DockerTagList artifacts={[TAG_14]} />);
    // formatBytes(50_000_000) ≈ "47.68 MB" / "50 MB"
    expect(screen.getByText(/MB/i)).toBeInTheDocument();
  });

  it("renders the last-pushed date for each tag", () => {
    render(<DockerTagList artifacts={[TAG_14]} />);
    // toLocaleDateString of 2026-04-10
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders an OK status badge by default for non-quarantined manifests", () => {
    render(<DockerTagList artifacts={[TAG_14]} />);
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.queryByTestId("quarantine-badge")).not.toBeInTheDocument();
  });

  it("renders a QuarantineBadge for quarantined manifests", () => {
    const qTag = {
      ...TAG_14,
      is_quarantined: true,
      quarantine_reason: "vulnerability",
      quarantine_until: "2099-01-01T00:00:00Z",
    };
    render(<DockerTagList artifacts={[qTag]} />);
    expect(screen.getByTestId("quarantine-badge")).toBeInTheDocument();
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Layer blobs hidden by default
  // -------------------------------------------------------------------------

  it("does NOT render raw blob rows by default", () => {
    render(<DockerTagList artifacts={[TAG_14, BLOB_1]} />);
    const rows = screen.getAllByTestId("docker-tag-row");
    expect(rows).toHaveLength(1);
    // The blob's path/digest must not be visible in default view
    expect(
      screen.queryByText(/abcd1234deadbeef/),
    ).not.toBeInTheDocument();
  });

  it("does NOT render digest-only manifests by default", () => {
    render(<DockerTagList artifacts={[TAG_14, DIGEST_MANIFEST]} />);
    expect(screen.getAllByTestId("docker-tag-row")).toHaveLength(1);
    expect(screen.queryByText(/deadbeefcafebabe/)).not.toBeInTheDocument();
  });

  it("shows a hidden-layers footer with a 'Show layers' toggle when blobs/digest manifests exist", () => {
    render(<DockerTagList artifacts={[TAG_14, BLOB_1, DIGEST_MANIFEST]} />);
    expect(screen.getByTestId("toggle-layers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show layers/i })).toBeInTheDocument();
    // The hidden-count message
    expect(screen.getByText(/hidden/i)).toBeInTheDocument();
  });

  it("DOES NOT render the layers footer when there are no hidden artifacts", () => {
    render(<DockerTagList artifacts={[TAG_14, TAG_LATEST]} />);
    expect(screen.queryByTestId("toggle-layers")).not.toBeInTheDocument();
  });

  it("clicking 'Show layers' reveals the docker-layer-list panel with blob & manifest paths", async () => {
    render(<DockerTagList artifacts={[TAG_14, BLOB_1, DIGEST_MANIFEST]} />);
    expect(screen.queryByTestId("docker-layer-list")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("toggle-layers"));
    const layerList = await screen.findByTestId("docker-layer-list");
    expect(within(layerList).getByText(BLOB_1.path)).toBeInTheDocument();
    expect(within(layerList).getByText(DIGEST_MANIFEST.path)).toBeInTheDocument();
  });

  it("toggling 'Show layers' twice hides the panel again", async () => {
    render(<DockerTagList artifacts={[TAG_14, BLOB_1]} />);
    const toggle = screen.getByTestId("toggle-layers");
    await userEvent.click(toggle);
    expect(screen.getByTestId("docker-layer-list")).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.queryByTestId("docker-layer-list")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Click handlers
  // -------------------------------------------------------------------------

  it("invokes onTagClick with the manifest artifact when a tag is clicked", async () => {
    const onTagClick = vi.fn();
    render(<DockerTagList artifacts={[TAG_14]} onTagClick={onTagClick} />);
    await userEvent.click(screen.getByText("14"));
    expect(onTagClick).toHaveBeenCalledTimes(1);
    expect(onTagClick).toHaveBeenCalledWith(TAG_14);
  });

  it("renders a Scan button only when onScan is supplied", () => {
    const { rerender } = render(
      <DockerTagList artifacts={[TAG_14]} />,
    );
    expect(
      screen.queryByRole("button", { name: /scan library\/node:14/i }),
    ).not.toBeInTheDocument();

    const onScan = vi.fn();
    rerender(<DockerTagList artifacts={[TAG_14]} onScan={onScan} />);
    expect(
      screen.getByRole("button", { name: /scan library\/node:14/i }),
    ).toBeInTheDocument();
  });

  it("invokes onScan with the manifest artifact when the Scan button is clicked", async () => {
    const onScan = vi.fn();
    render(<DockerTagList artifacts={[TAG_14]} onScan={onScan} />);
    await userEvent.click(
      screen.getByRole("button", { name: /scan library\/node:14/i }),
    );
    expect(onScan).toHaveBeenCalledWith(TAG_14);
  });

  it("disables the Scan button while scanPending=true", () => {
    render(
      <DockerTagList artifacts={[TAG_14]} onScan={vi.fn()} scanPending />,
    );
    expect(
      screen.getByRole("button", { name: /scan library\/node:14/i }),
    ).toBeDisabled();
  });
});
