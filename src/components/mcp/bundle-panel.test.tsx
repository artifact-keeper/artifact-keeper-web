// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { renderWithClient } from "./test-utils";

const api = vi.hoisted(() => ({ bundle: vi.fn() }));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api }));

import { McpBundlePanel } from "./bundle-panel";

afterEach(() => cleanup());

describe("McpBundlePanel", () => {
  it("shows the bundle and its download", async () => {
    api.bundle.mockResolvedValue({
      name: "a/b",
      version: "1",
      file_name: "b-1.mcpb",
      size_bytes: 2048,
      sha256: "abc123",
      signature_state: "verified",
      download_url: "/api/v1/tickets/xyz",
    });
    renderWithClient(<McpBundlePanel repoKey="k" name="a/b" version="1" />);
    expect(await screen.findByText("b-1.mcpb")).toBeInTheDocument();
    expect(screen.getByText("sha256:abc123")).toBeInTheDocument();
    expect(screen.getByText("signature verified")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download bundle/ })).toHaveAttribute("href", "/api/v1/tickets/xyz");
  });

  it("refuses an unsafe download url and labels unsigned bundles", async () => {
    api.bundle.mockResolvedValue({ name: "a/b", version: "1", sha256: "f", download_url: "javascript:alert(1)" });
    renderWithClient(<McpBundlePanel repoKey="k" name="a/b" version="1" />);
    expect(await screen.findByText("a/b-1.mcpb")).toBeInTheDocument();
    expect(screen.getByText("unsigned")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders nothing on a server without bundles", async () => {
    api.bundle.mockResolvedValue(null);
    const { container } = renderWithClient(<McpBundlePanel repoKey="k" name="a/b" version="1" />);
    await waitFor(() => expect(api.bundle).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="mcp-bundle"]')).toBeNull();
  });
});
