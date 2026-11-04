// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { PINS, SERVER, healthOf } from "./test-utils";
import { McpLineageGraph } from "./lineage-graph";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function list() {
  return screen.getByRole("list", { name: /Lineage of com.acme\/weather/ });
}

describe("McpLineageGraph", () => {
  it("renders an accessible list with artifact and verdict links", () => {
    render(
      <McpLineageGraph
        server={SERVER}
        pins={PINS}
        repoKey="mcp-local"
        health={healthOf([{ package: "npm:@acme/weather-mcp@1.4.2", high: 2 }], { status: "warning" })}
      />,
    );
    const l = list();
    expect(within(l).getByRole("link", { name: "npm-local" })).toHaveAttribute("href", "/repositories/npm-local?tab=artifacts");
    expect(within(l).getByRole("link", { name: "2 high" })).toHaveAttribute("href", "/repositories/npm-local?tab=security");
    expect(within(l).getByRole("link", { name: "docker-local" })).toBeInTheDocument();
    expect(within(l).getByText(/tag moved/)).toBeInTheDocument();
    expect(within(l).getAllByText(/no verdict yet/)).toHaveLength(1);
  });

  it("marks a remote as an external endpoint with a dashed connector", () => {
    render(<McpLineageGraph server={SERVER} pins={PINS} repoKey="mcp-local" health={null} />);
    expect(within(list()).getByText(/nothing stored, external endpoint/)).toBeInTheDocument();
    expect(within(list()).getAllByText(/verdict not available on this server/)).toHaveLength(2);
    const remoteEdge = document.querySelector('[data-edge="runner-2-artifact-2"]');
    expect(remoteEdge).toHaveAttribute("stroke-dasharray", "4 4");
    const pinnedEdge = document.querySelector('[data-edge="runner-0-artifact-0"]');
    expect(pinnedEdge).not.toHaveAttribute("stroke-dasharray");
    expect(document.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows not mirrored packages dashed and ungated under the open policy", () => {
    const server = { ...SERVER, remotes: [], packages: [{ ...SERVER.packages![0], registryBaseUrl: "https://registry.npmjs.org" }] };
    render(<McpLineageGraph server={server} repoKey="mcp-local" policy="open" />);
    expect(within(list()).getByText(/not mirrored: registry.npmjs.org/)).toBeInTheDocument();
    expect(within(list()).getByText(/not gated by Artifact Keeper/)).toBeInTheDocument();
    expect(document.querySelector('[data-edge="runner-0-artifact-0"]')).toHaveAttribute("stroke-dasharray", "4 4");
    expect(within(list()).queryByRole("link")).toBeNull();
  });

  it("summarises verdict states", () => {
    const health = healthOf(
      [
        { package: "npm:@acme/weather-mcp@1.4.2", gate: "quarantine", status: "critical" },
        { package: "oci:acme/weather:1.4.2", registryType: "oci", medium: 1, status: "warning" },
      ],
      { status: "critical" },
    );
    render(<McpLineageGraph server={SERVER} pins={PINS} repoKey="k" health={health} />);
    expect(within(list()).getByText(/held: quarantine/)).toBeInTheDocument();
    expect(within(list()).getByText(/1 medium/)).toBeInTheDocument();
  });

  it.each([
    [{ critical: 3, high: 1 }, "3 critical"],
    [{ high: 2, medium: 4 }, "2 high"],
    [{ gate: "age_gate" }, "held: age_gate"],
    [{ gate: "unavailable" }, "verdict unavailable"],
    [{ scanned: false, score: null, grade: null }, "not scanned yet"],
    [{ grade: "A" }, "clean (grade A)"],
    [{ grade: null, low: 3, info: 1 }, "clean"],
  ])("verdict %o", (row, text) => {
    render(
      <McpLineageGraph
        server={{ ...SERVER, packages: [SERVER.packages![0]], remotes: [] }}
        pins={PINS}
        repoKey="k"
        health={healthOf([{ package: "npm:@acme/weather-mcp@1.4.2", ...row }])}
      />,
    );
    expect(within(list()).getByRole("link", { name: text })).toBeInTheDocument();
  });

  it("observes resizes when ResizeObserver exists", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { observe = observe; disconnect = disconnect; unobserve() {} });
    const { unmount } = render(<McpLineageGraph server={SERVER} repoKey="k" />);
    expect(observe).toHaveBeenCalled();
    expect(within(list()).getAllByText(/loading verdict/)).toHaveLength(2);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("says when there is no way to run it", () => {
    render(<McpLineageGraph server={{ ...SERVER, packages: [], remotes: [] }} repoKey="k" />);
    expect(screen.getByText(/declares no way to run it/)).toBeInTheDocument();
  });
});
