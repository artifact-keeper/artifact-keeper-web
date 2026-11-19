// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => mockToast(...a) } }));
vi.mock("@/components/ui/select", async () => (await import("./__tests__/mcp-fixtures")).selectMock());
const mockListVersions = vi.fn();
vi.mock("@/lib/api/mcp", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/mcp")>()),
  mcpApi: { listVersions: (...a: unknown[]) => mockListVersions(...a) },
}));

import { McpInstallPanel, McpInstallSheet, configFieldsOf } from "./install-panel";
import { EMPTY, REMOTE_ONLY, SQL, WEATHER, WEATHER_OLD, served } from "./__tests__/mcp-fixtures";
import { runnersOf } from "@/lib/mcp/server-json";

const writeText = vi.fn();
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  mockToast.mockReset();
});
afterEach(cleanup);

const code = (label: string) => screen.getByLabelText(label).textContent ?? "";

describe("McpInstallPanel", () => {
  it("defaults to the first package and Claude Code, with the AK registry and a secret placeholder", () => {
    render(<McpInstallPanel repoKey="mcp-local" entry={WEATHER} />);
    const cli = code("Claude Code configuration (Command line)");
    expect(cli).toContain("claude mcp add weather");
    expect(cli).toContain("--registry https://ak.example/npm/npm-local/");
    expect(cli).toContain("@acme/weather-mcp@1.4.2");
    expect(cli).toContain('ACME_API_KEY="${ACME_API_KEY}"');
    expect(screen.getByText(/1 secret is left as a placeholder/)).toBeInTheDocument();
  });

  it("masks a secret, reveals it on request, and never puts it in a snippet", async () => {
    render(<McpInstallPanel repoKey="mcp-local" entry={WEATHER} />);
    const secret = screen.getByLabelText(/^ACME_API_KEY/) as HTMLInputElement;
    expect(secret.type).toBe("password");
    expect(secret).toHaveAttribute("autocomplete", "off");
    fireEvent.change(secret, { target: { value: "sk-live-very-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Show ACME_API_KEY" }));
    expect(secret.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide ACME_API_KEY" }));
    expect(secret.type).toBe("password");
    expect(document.body.querySelectorAll("pre")).not.toHaveLength(0);
    for (const pre of document.body.querySelectorAll("pre")) {
      expect(pre.textContent).not.toContain("sk-live-very-secret");
    }
    expect(screen.getByText(/secret, emitted as \$\{ACME_API_KEY\}/)).toBeInTheDocument();
  });

  it("inlines non-secret values and choices, and shows defaults", () => {
    render(<McpInstallPanel repoKey="mcp-local" entry={WEATHER} />);
    expect(screen.getByText("default: us-east-1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^ACME_REGION/), { target: { value: "eu-west-1" } });
    fireEvent.change(screen.getByLabelText("--units"), { target: { value: "imperial" } });
    const cli = code("Claude Code configuration (Command line)");
    expect(cli).toContain("ACME_REGION=eu-west-1");
    expect(cli).toContain("--units imperial");
  });

  it("drops the version when Pin exact version is unticked", () => {
    render(<McpInstallPanel repoKey="mcp-local" entry={WEATHER} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin exact version" }));
    const cli = code("Claude Code configuration (Command line)");
    expect(cli).not.toContain("@acme/weather-mcp@1.4.2");
    expect(cli).toContain("@acme/weather-mcp");
  });

  it("switching to the remote runner changes the snippet and the fields", () => {
    render(<McpInstallPanel repoKey="mcp-local" entry={WEATHER} />);
    fireEvent.click(screen.getByRole("radio", { name: /remote streamable-http/ }));
    const cli = code("Claude Code configuration (Command line)");
    expect(cli).toContain("claude mcp add --transport http weather https://mcp.acme.dev/mcp");
    expect(cli).toContain("Authorization: Bearer ${TOKEN}");
    expect(screen.queryByLabelText(/^ACME_API_KEY/)).toBeNull();
    expect((screen.getByLabelText(/^token/) as HTMLInputElement).type).toBe("password");
    expect(screen.queryByRole("checkbox", { name: "Pin exact version" })).toBeNull();
  });

  it("switching client changes the code; VS Code also offers the gallery URL", async () => {
    const user = userEvent.setup();
    render(<McpInstallPanel repoKey="mcp-local" entry={WEATHER} />);
    await user.click(screen.getByRole("tab", { name: "VS Code" }));
    const vs = code("VS Code configuration");
    expect(vs).toContain('"servers"');
    expect(vs).toContain("${input:acme-api-key}");
    expect(screen.getByText(".vscode/mcp.json")).toBeInTheDocument();
    expect(code("VS Code gallery setting")).toBe(
      `"chat.mcp.gallery.serviceUrl": "${window.location.origin}/mcp/mcp-local"`,
    );
    await user.click(screen.getByRole("tab", { name: "Cursor" }));
    expect(code("Cursor configuration")).toContain("${env:ACME_API_KEY}");
    await user.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    expect(code("Claude Desktop configuration")).toContain("<SET_LOCALLY:ACME_API_KEY>");
    await user.click(screen.getByRole("tab", { name: "Windsurf" }));
    expect(code("Windsurf configuration")).toContain("${env:ACME_API_KEY}");
    expect(screen.getByText("~/.codeium/windsurf/mcp_config.json")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "JSON" }));
    expect(code("JSON configuration (server.json package)")).toContain('"registryType": "npm"');
  });

  it("copies the snippet and announces it", async () => {
    render(<McpInstallPanel repoKey="mcp-local" entry={SQL} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Claude Code configuration (Command line)" }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Copied"));
    expect(writeText.mock.calls[0][0]).toContain("ak.example/docker-local/acme/sql:2.0.0@sha256:abc123");
    expect(writeText.mock.calls[0][0]).toContain('DATABASE_URL="${DATABASE_URL}"');
  });

  it("lists versions with latest marked and reports a change", () => {
    const onVersionChange = vi.fn();
    render(
      <McpInstallPanel repoKey="mcp-local" entry={WEATHER} versions={[WEATHER, WEATHER_OLD]} onVersionChange={onVersionChange} />,
    );
    const select = screen.getByLabelText("Version") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["-", "1.4.2 (latest)", "1.3.0"]);
    fireEvent.change(select, { target: { value: "1.3.0" } });
    expect(onVersionChange).toHaveBeenCalledWith("1.3.0");
  });

  it("warns when an entry has no way to run it", () => {
    render(<McpInstallPanel repoKey="mcp-local" entry={EMPTY} />);
    expect(screen.getByText("This entry declares no way to run it")).toBeInTheDocument();
  });

  it("says when a client cannot run a package", async () => {
    const user = userEvent.setup();
    const bundle = served({
      name: "com.acme/bundle",
      description: "",
      version: "1.0.0",
      packages: [{ registryType: "mcpb", identifier: "https://x.example/b.mcpb", transport: { type: "stdio" } }],
    });
    render(<McpInstallPanel repoKey="mcp-local" entry={bundle} />);
    expect(screen.getByText("Claude Code cannot run this package directly.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    expect(code("Claude Desktop configuration")).toContain("open");
  });

  it("remote-only server: no Run as choice, secret header field", () => {
    render(<McpInstallPanel repoKey="mcp-local" entry={REMOTE_ONLY} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect((screen.getByLabelText(/^X-Api-Key/) as HTMLInputElement).type).toBe("password");
    expect(code("Claude Code configuration (Command line)")).toContain("--transport sse");
  });
});

describe("configFieldsOf", () => {
  it("lists inputs without a fixed value, and the variables of fixed ones, once each", () => {
    const [pkg, remote] = runnersOf(WEATHER.server);
    expect(configFieldsOf(pkg).map((f) => f.key)).toEqual(["ACME_API_KEY", "ACME_REGION", "--units"]);
    expect(configFieldsOf(remote).map((f) => f.key)).toEqual(["token"]);
  });
});

describe("McpInstallSheet", () => {
  it("loads versions when open and switches the shown version", async () => {
    mockListVersions.mockResolvedValue([WEATHER, WEATHER_OLD]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <McpInstallSheet open onOpenChange={() => {}} repoKey="mcp-local" entry={WEATHER} />
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Install com.acme/weather v1.4.2")).toBeInTheDocument();
    await waitFor(() => expect(mockListVersions).toHaveBeenCalledWith("mcp-local", "com.acme/weather"));
    const select = await within(dialog).findByLabelText("Version");
    fireEvent.change(select, { target: { value: "1.3.0" } });
    expect(within(dialog).getByText("Install com.acme/weather v1.3.0")).toBeInTheDocument();
  });

  it("renders nothing inside when closed or without an entry", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <McpInstallSheet open={false} onOpenChange={() => {}} repoKey="mcp-local" entry={null} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockListVersions).not.toHaveBeenCalledWith("mcp-local", "");
  });
});
