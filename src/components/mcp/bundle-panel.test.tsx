// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, cleanup } from "@testing-library/react";
import type { McpBundle } from "@/types/mcp";
import { renderWithClient } from "./test-utils";
import { McpBundlePanel } from "./bundle-panel";

afterEach(() => cleanup());

/** A `metadata.bundles[]` entry as the upload records it. */
const BUNDLE: McpBundle = {
  index: 0,
  artifactId: "art-mcpb",
  file: "weather-1.4.2.mcpb",
  fileSha256: "abc123",
  size: 2048,
  signature: { state: "valid", signer: "Acme Inc", issuer: "Acme CA", selfSigned: false },
  manifest: { name: "weather" },
};
const URL = "https://ak.example/mcp/mcp-local/bundles/weather-1.4.2.mcpb?ticket=xyz";

describe("McpBundlePanel", () => {
  it("shows the stored bundle facts and its download", () => {
    renderWithClient(<McpBundlePanel bundle={BUNDLE} downloadUrl={URL} />);
    expect(screen.getByText("weather-1.4.2.mcpb")).toBeInTheDocument();
    expect(screen.getByText("2 KiB")).toBeInTheDocument();
    expect(screen.getByText("sha256:abc123")).toBeInTheDocument();
    expect(screen.getByText("signed, trusted signer")).toBeInTheDocument();
    expect(screen.getByText("signed by Acme Inc")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download bundle/ })).toHaveAttribute("href", URL);
  });

  it("labels a signature from an untrusted signer", () => {
    renderWithClient(
      <McpBundlePanel bundle={{ ...BUNDLE, signature: { state: "self_signed", signer: "me", selfSigned: true } }} />,
    );
    expect(screen.getByText("signed, untrusted signer")).toBeInTheDocument();
    expect(screen.getByText("signed, untrusted signer").closest("[title]")).toHaveAttribute(
      "title",
      expect.stringContaining("not on this instance's trusted list"),
    );
    expect(screen.getByText("signed by me (self-signed)")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("labels an unsigned bundle and an unknown signature state", () => {
    const { rerender } = renderWithClient(
      <McpBundlePanel bundle={{ index: 0, fileSha256: "f", manifest: null }} />,
    );
    expect(screen.getByText("bundle.mcpb")).toBeInTheDocument();
    expect(screen.getByText("unsigned")).toBeInTheDocument();
    rerender(<McpBundlePanel bundle={{ index: 0, fileSha256: "f", signature: { state: "expired" } }} />);
    expect(screen.getByText("signature expired")).toBeInTheDocument();
  });

  it("refuses an unsafe or relative download url", () => {
    const { rerender, container } = renderWithClient(
      <McpBundlePanel bundle={BUNDLE} downloadUrl="javascript:alert(1)" />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    rerender(<McpBundlePanel downloadUrl="javascript:alert(1)" />);
    expect(container.querySelector('[data-testid="mcp-bundle"]')).toBeNull();
  });

  it("shows only the download when no upload facts are stored", () => {
    renderWithClient(<McpBundlePanel downloadUrl={URL} />);
    expect(screen.getByText("bundle.mcpb")).toBeInTheDocument();
    expect(screen.queryByText(/sha256:/)).toBeNull();
    expect(screen.queryByText("unsigned")).toBeNull();
    expect(screen.getByRole("link", { name: /Download bundle/ })).toHaveAttribute("href", URL);
  });

  it("renders nothing without a bundle or a url", () => {
    const { container } = renderWithClient(<McpBundlePanel />);
    expect(container.querySelector('[data-testid="mcp-bundle"]')).toBeNull();
  });
});
