// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { McpRunnerList } from "./runner-list";
import { McpInputsTable } from "./env-vars-table";
import { McpServerJsonViewer } from "./server-json-viewer";
import { EMPTY, SQL, WEATHER } from "./__tests__/mcp-fixtures";
import type { McpPackagePin } from "@/types/mcp";

afterEach(cleanup);

const NPM_PIN: McpPackagePin = {
  index: 0,
  registryType: "npm",
  submitted: { identifier: "@acme/weather-mcp", version: "1.4.2" },
  resolved: { repository: "npm-local" },
};

describe("McpRunnerList", () => {
  it("lists each package with its pin and each remote", () => {
    render(<McpRunnerList server={WEATHER.server} pins={[NPM_PIN]} repoKey="mcp-local" />);
    const pkg = screen.getByRole("region", { name: "Package 1: npm @acme/weather-mcp" });
    expect(within(pkg).getByText("@acme/weather-mcp")).toBeInTheDocument();
    expect(within(pkg).getByText("v1.4.2")).toBeInTheDocument();
    expect(within(pkg).getByText("@acme/weather-mcp@1.4.2")).toBeInTheDocument();
    expect(within(pkg).getByRole("link", { name: "npm-local" })).toHaveAttribute("href", "/repositories/npm-local");
    expect(within(pkg).getByText("https://ak.example/npm/npm-local")).toBeInTheDocument();
    expect(within(pkg).getByText("Environment variables")).toBeInTheDocument();
    expect(within(pkg).getByText("Arguments")).toBeInTheDocument();
    expect(within(pkg).queryByText("tag moved")).toBeNull();

    const remote = screen.getByRole("region", { name: "Remote 1: streamable-http" });
    expect(within(remote).getByText("https://mcp.acme.dev/mcp")).toBeInTheDocument();
    expect(within(remote).queryByRole("link")).toBeNull();
    expect(within(remote).getByText("Headers")).toBeInTheDocument();
  });

  it("shows the served OCI reference, the submitted tag, the backing repo and drift", () => {
    const pin: McpPackagePin = {
      index: 0,
      registryType: "oci",
      submitted: { identifier: "ghcr.io/acme/sql:2.0.0" },
      resolved: { repository: "docker-local", digest: "sha256:abc123" },
      drift: { observedDigest: "sha256:def" },
    };
    render(<McpRunnerList server={SQL.server} pins={[pin]} repoKey="mcp-local" />);
    expect(screen.getByText("ak.example/docker-local/acme/sql:2.0.0@sha256:abc123")).toBeInTheDocument();
    expect(screen.queryByText("Pinned digest")).toBeNull();
    expect(screen.getByText("ghcr.io/acme/sql:2.0.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docker-local" })).toBeInTheDocument();
    expect(screen.getByText("tag moved")).toBeInTheDocument();
  });

  it("shows the pinned digest when the identifier does not carry it", () => {
    const server = { ...SQL.server, packages: [{ ...SQL.server.packages![0], identifier: "ak.example/x:1", _meta: undefined }] };
    const pin: McpPackagePin = {
      index: 0,
      registryType: "oci",
      submitted: { identifier: "ghcr.io/x:1" },
      resolved: { repository: "docker-local", digest: "sha256:fff" },
    };
    render(<McpRunnerList server={server} pins={[pin]} repoKey="mcp-local" />);
    expect(screen.getByText("Pinned digest")).toBeInTheDocument();
    expect(screen.getByText("sha256:fff")).toBeInTheDocument();
    expect(screen.getByText("ghcr.io/x:1")).toBeInTheDocument();
  });

  it("warns when there is no way to run the server", () => {
    render(<McpRunnerList server={EMPTY.server} repoKey="mcp-local" />);
    expect(screen.getByRole("alert")).toHaveTextContent("This entry declares no way to run it");
  });
});

describe("McpInputsTable", () => {
  it("masks secret values and lists choices", () => {
    render(
      <McpInputsTable
        caption="Env"
        inputs={[
          { name: "TOKEN", isSecret: true, default: "hunter2", isRequired: true },
          { name: "MODE", choices: ["a", "b"], default: "a", description: "Mode" },
          { valueHint: "path" },
          {},
        ]}
      />,
    );
    expect(screen.queryByText("hunter2")).toBeNull();
    expect(screen.getByText("••••••••")).toBeInTheDocument();
    expect(screen.getByText("secret")).toBeInTheDocument();
    expect(screen.getByText("(a | b)")).toBeInTheDocument();
    expect(screen.getByText("path")).toBeInTheDocument();
    expect(screen.getByText("(positional)")).toBeInTheDocument();
    expect(screen.getAllByText("yes")).toHaveLength(1);
  });

  it("renders nothing for no inputs", () => {
    const { container } = render(<McpInputsTable caption="Env" inputs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("McpServerJsonViewer", () => {
  it("renders JSON as text, collapsed", () => {
    render(<McpServerJsonViewer value={{ name: "<b>x</b>" }} />);
    const details = screen.getByText("Raw server.json").closest("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByLabelText("Raw server.json").textContent).toContain('"name": "<b>x</b>"');
    expect(document.querySelector("b")).toBeNull();
  });

  it("takes a label", () => {
    render(<McpServerJsonViewer value={[]} label="metadata" />);
    expect(screen.getByLabelText("Raw metadata")).toHaveTextContent("[]");
  });
});
