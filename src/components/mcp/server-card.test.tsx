// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { McpServerCard, mcpServerHref } from "./server-card";
import { McpServerAvatar } from "./server-avatar";
import { McpSourceBadge } from "./source-badge";
import { McpStatusBadge } from "./status-badge";
import { LEGACY, REMOTE_ONLY, SQL, WEATHER, served } from "./__tests__/mcp-fixtures";
import { MCP_AK_SOURCE_META_KEY } from "@/types/mcp";

afterEach(cleanup);

describe("McpServerCard", () => {
  it("renders the name, version, source, transports and secrets as text", () => {
    render(<McpServerCard repoKey="mcp-local" entry={WEATHER} packageId="pkg-1" />);
    const card = screen.getByRole("article", { name: "com.acme/weather" });
    expect(within(card).getByText("v1.4.2")).toBeInTheDocument();
    expect(within(card).getByText("latest")).toBeInTheDocument();
    expect(within(card).getByText("hosted")).toBeInTheDocument();
    expect(within(card).getByText("stdio·npm")).toBeInTheDocument();
    expect(within(card).getByText("http")).toBeInTheDocument();
    expect(within(card).getByText(/1 secret$/)).toBeInTheDocument();
    expect(within(card).getByText("Weather forecasts and alerts")).toBeInTheDocument();
  });

  it("never claims a tool count", () => {
    render(<McpServerCard repoKey="mcp-local" entry={WEATHER} />);
    expect(screen.queryByText(/tools?/i)).toBeNull();
  });

  it("uses a monogram, never a remote image", () => {
    const withIcon = served({ ...WEATHER.server, icons: [{ src: "https://evil.example/x.png" }] });
    const { container } = render(<McpServerCard repoKey="mcp-local" entry={withIcon} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("mcp-server-avatar")).toHaveTextContent("W");
    expect(screen.getByTestId("mcp-server-avatar")).toHaveAttribute("aria-hidden", "true");
  });

  it("links to the package page, or back to the gallery without an id", () => {
    const { unmount } = render(<McpServerCard repoKey="mcp-local" entry={WEATHER} packageId="pkg-1" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/packages/pkg-1");
    unmount();
    render(<McpServerCard repoKey="mcp local" entry={WEATHER} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/repositories/mcp%20local?tab=packages&server=com.acme%2Fweather",
    );
    expect(mcpServerHref("r", "a/b")).toBe("/repositories/r?tab=packages&server=a%2Fb");
  });

  it("keeps Install a sibling of the link and calls back with the entry", () => {
    const onInstall = vi.fn();
    render(<McpServerCard repoKey="mcp-local" entry={WEATHER} onInstall={onInstall} />);
    const link = screen.getByRole("link");
    const button = screen.getByRole("button", { name: "Install com.acme/weather" });
    expect(link.contains(button)).toBe(false);
    expect(link.querySelector("button, a, [tabindex]")).toBeNull();
    fireEvent.click(button);
    expect(onInstall).toHaveBeenCalledWith(WEATHER);
  });

  it("omits Install without a handler and shows the repository chip on request", () => {
    render(<McpServerCard repoKey="mcp-local" entry={SQL} showRepo />);
    expect(screen.queryByRole("button", { name: /Install/ })).toBeNull();
    expect(screen.getByText("mcp-local")).toBeInTheDocument();
    expect(screen.getByText("stdio·oci")).toBeInTheDocument();
  });

  it("shows status and risk signals that matter", () => {
    render(<McpServerCard repoKey="mcp-local" entry={LEGACY} />);
    expect(screen.getByText("deprecated", { selector: "[data-slot=badge]" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^deprecated: The publisher marked/)).toBeInTheDocument();
  });

  it("labels an upstream entry from server-side meta only", () => {
    const upstream = served(REMOTE_ONLY.server, {
      [MCP_AK_SOURCE_META_KEY]: {
        repository: "mcp-remote",
        origin: "remote",
        kind: "upstream",
        upstreamVerified: true,
        upstreamUrl: "https://registry.modelcontextprotocol.io",
      },
    });
    render(<McpServerCard repoKey="mcp-remote" entry={upstream} />);
    const badge = screen.getByText("proxied, upstream verified");
    expect(badge.closest("[title]")).toHaveAttribute(
      "title",
      expect.stringContaining("Upstream: https://registry.modelcontextprotocol.io"),
    );
    expect(screen.getByText("sse")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^unverified source/)).toBeNull();
  });

  it("flags an unverified mirrored entry and names the Virtual that served it", () => {
    const mirrored = served(REMOTE_ONLY.server, {
      [MCP_AK_SOURCE_META_KEY]: {
        repository: "mcp-mirror",
        origin: "mirror",
        kind: "upstream",
        upstreamVerified: false,
        upstreamUrl: "https://other.example/registry",
        virtualRepository: "mcp-all",
      },
    });
    render(<McpServerCard repoKey="mcp-all" entry={mirrored} />);
    expect(screen.getByText("mirrored").closest("[title]")).toHaveAttribute(
      "title",
      expect.stringContaining("Served by mcp-all from member mcp-mirror"),
    );
    expect(screen.getByLabelText(/^unverified source: /)).toBeInTheDocument();
  });

  it("says source unknown without a source block", () => {
    render(<McpServerCard repoKey="mcp-local" entry={{ server: REMOTE_ONLY.server }} />);
    expect(screen.getByText("source unknown")).toBeInTheDocument();
  });
});

describe("small badges", () => {
  it("avatar falls back to ? for a name without letters", () => {
    render(<McpServerAvatar name="com.acme/---" className="size-6" />);
    expect(screen.getByTestId("mcp-server-avatar")).toHaveTextContent("?");
  });

  it.each([
    ["hosted", "hosted", /emerald/],
    ["remote", "proxied", /amber/],
    ["remote-verified", "proxied, upstream verified", /blue/],
    ["mirror", "mirrored", /amber/],
    ["mirror-verified", "mirrored, upstream verified", /blue/],
    ["unknown", "source unknown", /./],
  ] as const)("source badge %s reads %s", (kind, label, color) => {
    render(<McpSourceBadge kind={kind} upstreamUrl="https://up.example" />);
    const badge = screen.getByText(label);
    expect(badge.className).toMatch(color);
    const title = badge.closest("[title]")?.getAttribute("title") ?? "";
    expect(title.length).toBeGreaterThan(0);
    expect(title.includes("Upstream: https://up.example")).toBe(kind !== "hosted");
  });

  it("source badge falls back to unknown for an unexpected kind", () => {
    render(<McpSourceBadge kind={"upstream" as never} />);
    expect(screen.getByText("source unknown")).toBeInTheDocument();
  });

  it("source badge names the Virtual only with both repositories", () => {
    render(<McpSourceBadge kind="hosted" virtualRepository="mcp-all" />);
    expect(screen.getByText("hosted").closest("[title]")?.getAttribute("title")).toBe(
      "Published to this Artifact Keeper instance",
    );
  });

  it("status badge renders held and deleted", () => {
    render(
      <>
        <McpStatusBadge status="held" />
        <McpStatusBadge status="deleted" />
      </>,
    );
    expect(screen.getByText("held")).toBeInTheDocument();
    expect(screen.getByText("deleted").className).toMatch(/red/);
  });
});
