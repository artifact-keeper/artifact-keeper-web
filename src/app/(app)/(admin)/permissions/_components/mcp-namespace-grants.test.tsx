// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Repository } from "@/types";
import type { McpNamespaceGrant } from "@/types/mcp";

// Radix Checkbox measures itself.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const api = vi.hoisted(() => ({
  listNamespaceGrants: vi.fn(),
  createNamespaceGrant: vi.fn(),
  deleteNamespaceGrant: vi.fn(),
}));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api }));
vi.mock("@/lib/api/admin", () => ({
  adminApi: { listUsers: vi.fn().mockResolvedValue([{ id: "u1", username: "alice", display_name: "Alice" }]) },
}));
vi.mock("@/lib/api/groups", () => ({
  groupsApi: { list: vi.fn().mockResolvedValue({ items: [{ id: "g1", name: "publishers" }] }) },
}));
vi.mock("@/lib/api/service-accounts", () => ({
  serviceAccountsApi: { list: vi.fn().mockResolvedValue([{ id: "s1", username: "svc-ci", display_name: "" }]) },
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));

// Native <select> keyed by the trigger's aria-label (Radix Select needs a
// real pointer stack).
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
    let label = "";
    const items: { value: string; label: string }[] = [];
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const props = child.props as { "aria-label"?: string; children?: React.ReactNode };
      if (props["aria-label"]) label = props["aria-label"];
      React.Children.forEach(props.children, (sub) => {
        if (!React.isValidElement(sub)) return;
        const sp = sub.props as { value?: string; children?: React.ReactNode };
        if (sp.value) items.push({ value: sp.value, label: String(sp.children) });
        else
          React.Children.forEach(sp.children, (leaf) => {
            if (React.isValidElement(leaf)) {
              const lp = leaf.props as { value: string; children: React.ReactNode };
              items.push({ value: lp.value, label: String(lp.children) });
            }
          });
      });
    });
    return (
      <select aria-label={label} value={value} onChange={(e) => onValueChange?.(e.target.value)}>
        <option value="" />
        {items.map((i) => (
          <option key={i.value} value={i.value}>{i.label}</option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

import { McpNamespaceGrants } from "./mcp-namespace-grants";

const REPOS = [
  { id: "1", key: "mcp-local", format: "mcp", repo_type: "local", mcp_require_namespace_grant: true },
  { id: "2", key: "mcp-team", format: "mcp", repo_type: "local" },
  { id: "3", key: "mcp-proxy", format: "mcp", repo_type: "remote" },
  { id: "4", key: "npm-local", format: "npm", repo_type: "local" },
] as unknown as Repository[];

const GRANT: McpNamespaceGrant = {
  id: "gr1",
  repository_id: "1",
  principal_type: "group",
  principal_id: "g1",
  principal_name: "publishers",
  actions: ["write"],
  namespaces: ["com.acme", "com.acme.team"],
};

function setup(repos: Repository[] = REPOS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <McpNamespaceGrants repositories={repos} />
    </QueryClientProvider>,
  );
  return { spy, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  api.listNamespaceGrants.mockResolvedValue([GRANT]);
});
afterEach(() => cleanup());

describe("McpNamespaceGrants", () => {
  it("renders nothing without a hosted MCP repository", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <McpNamespaceGrants repositories={REPOS.filter((r) => r.repo_type === "remote" || r.format !== "mcp")} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(api.listNamespaceGrants).not.toHaveBeenCalled();
  });

  it("hides when the backend does not serve grants", async () => {
    api.listNamespaceGrants.mockResolvedValue(null);
    setup();
    await waitFor(() => expect(api.listNamespaceGrants).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("MCP namespace grants")).not.toBeInTheDocument());
  });

  it("says grants are not available when deep-linked to a backend without them", async () => {
    api.listNamespaceGrants.mockResolvedValue(null);
    searchParams = new URLSearchParams("mcp=mcp-team");
    setup();
    expect(await screen.findByText(/namespace grants are not available on this server/)).toBeInTheDocument();
  });

  it("lists grants of the first hosted repository and explains when they apply", async () => {
    setup();
    expect(await screen.findByText("publishers")).toBeInTheDocument();
    expect(api.listNamespaceGrants).toHaveBeenCalledWith("mcp-local");
    expect(screen.getByText("com.acme.team")).toBeInTheDocument();
    expect(screen.getByText("Required on this repository")).toBeInTheDocument();
    expect(screen.getByText(/mcp_require_namespace_grant/)).toBeInTheDocument();
    const options = within(screen.getByLabelText("MCP repository")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["", "mcp-local", "mcp-team"]);
  });

  it("preselects ?mcp= and switches repositories", async () => {
    api.listNamespaceGrants.mockResolvedValue([]);
    searchParams = new URLSearchParams("mcp=mcp-team");
    const { user } = setup();
    expect(await screen.findByText("No namespace grants on mcp-team.")).toBeInTheDocument();
    expect(screen.getByText("Not required on this repository")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("MCP repository"), "mcp-local");
    expect(await screen.findByText("No namespace grants on mcp-local.")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    api.listNamespaceGrants.mockRejectedValue(new Error("x"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't load the namespace grants/);
  });

  it("deletes a grant after confirmation", async () => {
    api.deleteNamespaceGrant.mockResolvedValue(undefined);
    const { user, spy } = setup();
    await user.click(await screen.findByRole("button", { name: "Delete grant for publishers" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete grant" }));
    await waitFor(() => expect(api.deleteNamespaceGrant).toHaveBeenCalledWith("mcp-local", "gr1"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Namespace grant deleted"));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
  });

  it("toasts a failed delete", async () => {
    api.deleteNamespaceGrant.mockRejectedValue(new Error("x"));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Delete grant for publishers" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete grant" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("creates a grant with validated namespaces", async () => {
    api.createNamespaceGrant.mockResolvedValue(GRANT);
    const { user, spy } = setup();
    await user.click(await screen.findByRole("button", { name: /Create grant/ }));
    const dialog = await screen.findByRole("dialog");
    const d = within(dialog);
    const submit = d.getByRole("button", { name: "Create grant" });
    expect(submit).toBeDisabled();

    await user.selectOptions(d.getByLabelText("Principal type"), "group");
    await waitFor(() => expect(d.getByRole("option", { name: "publishers" })).toBeInTheDocument());
    await user.selectOptions(d.getByLabelText("Principal"), "g1");

    const ns = d.getByLabelText("Namespaces");
    await user.type(ns, "com.acme/x{Enter}");
    expect(d.getByText(/has no slash/)).toBeInTheDocument();
    expect(ns).toHaveAttribute("aria-invalid", "true");
    await user.clear(ns);
    await user.type(ns, "com.acme{Enter}");
    await user.type(ns, "org.example");
    await user.click(d.getByRole("button", { name: "Add" }));
    // Duplicates collapse.
    await user.type(ns, "com.acme{Enter}");
    expect(d.getAllByRole("listitem")).toHaveLength(2);
    await user.click(d.getByRole("button", { name: "Remove org.example" }));
    await user.click(d.getByRole("checkbox", { name: "delete (edit status)" }));

    await user.click(submit);
    await waitFor(() =>
      expect(api.createNamespaceGrant).toHaveBeenCalledWith("mcp-local", {
        principal_type: "group",
        principal_id: "g1",
        actions: ["write", "delete"],
        namespaces: ["com.acme"],
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Namespace grant created"));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
  });

  it("offers users and service accounts as principals and needs an action", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: /Create grant/ }));
    const d = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(d.getByRole("option", { name: "Alice" })).toBeInTheDocument());
    await user.selectOptions(d.getByLabelText("Principal type"), "service_account");
    await waitFor(() => expect(d.getByRole("option", { name: "svc-ci" })).toBeInTheDocument());
    await user.selectOptions(d.getByLabelText("Principal"), "s1");
    await user.type(d.getByLabelText("Namespaces"), "com.acme{Enter}");
    await user.click(d.getByRole("checkbox", { name: "write (publish)" }));
    expect(d.getByRole("button", { name: "Create grant" })).toBeDisabled();
    await user.click(d.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("toasts a failed create", async () => {
    api.createNamespaceGrant.mockRejectedValue(new Error("x"));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: /Create grant/ }));
    const d = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(d.getByRole("option", { name: "Alice" })).toBeInTheDocument());
    await user.selectOptions(d.getByLabelText("Principal"), "u1");
    await user.type(d.getByLabelText("Namespaces"), "com.acme{Enter}");
    await user.click(d.getByRole("button", { name: "Create grant" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
