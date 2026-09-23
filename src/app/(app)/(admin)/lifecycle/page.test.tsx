// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { POLICY_TYPE_LABELS, type LifecyclePolicy, type PolicyType } from "@/types/lifecycle";
import LifecyclePage from "./page";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const { api, auth } = vi.hoisted(() => ({
  api: {
    list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    execute: vi.fn(), preview: vi.fn(), executeAll: vi.fn(), assignmentSupport: vi.fn(),
  },
  auth: { user: { is_admin: true } },
}));
// Only the network surface is mocked: `withExclusions` and
// `parseLifecycleConfigError` are pure helpers the page is under test with.
vi.mock("@/lib/api/lifecycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/lifecycle")>()),
  lifecycleApi: api,
}));
vi.mock("@/lib/sdk-client", () => ({}));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const policy: LifecyclePolicy = {
  id: "p1", name: "Cleanup", description: null, enabled: true, policy_type: "max_age_days",
  config: { days: 90 }, priority: 100, repository_id: null,
  applies_to_all: false, repository_ids: [], scope_source: "explicit",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  last_run_at: null, last_run_items_removed: null,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><LifecyclePage /></QueryClientProvider>);
  return { client, invalidate };
}

async function openCreate() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New Policy" }));
  await user.type(screen.getByLabelText("Name"), "Cleanup");
  await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeEnabled());
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.is_admin = true;
  api.assignmentSupport.mockResolvedValue(true);
  api.list.mockResolvedValue([]);
  api.create.mockResolvedValue(policy);
});
afterEach(cleanup);

describe("Lifecycle policy scope", () => {
  it.each(Object.keys(POLICY_TYPE_LABELS) as PolicyType[])("creates %s unassigned without requiring a repository", async (type) => {
    const { invalidate } = renderPage();
    const user = await openCreate();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText(/created unassigned with no effect/i)).toBeInTheDocument();
    if (type !== "max_age_days") {
      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByRole("option", { name: POLICY_TYPE_LABELS[type] }));
    }
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({
      name: "Cleanup", description: undefined, policy_type: type,
      config: expect.any(Object), applies_to_all: false, repository_ids: [],
    }));
    expect(api.create.mock.calls[0][0]).not.toHaveProperty("repository_id");
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["lifecycle-policies"] }));
  });

  it("only opts into global cleanup when the checkbox is checked", async () => {
    renderPage();
    const user = await openCreate();
    await user.click(screen.getByRole("checkbox", { name: /automatically apply to all current and future/i }));
    expect(screen.getByText(/individual repositories cannot opt out/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ applies_to_all: true, repository_ids: [] }),
    ));
  });

  it("unchecking the global option restores the dormant payload", async () => {
    renderPage();
    const user = await openCreate();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ applies_to_all: false, repository_ids: [] }),
    ));
  });

  it("does not retain global opt-in across cancelled or successful creates", async () => {
    renderPage();
    const user = await openCreate();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openCreate();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openCreate();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("blocks empty-collection creation on unsupported backend and allows retry", async () => {
    api.assignmentSupport.mockRejectedValue(new Error("Upgrade required"));
    renderPage();
    expect(await screen.findByText("Upgrade required")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New Policy" }));
    await user.type(screen.getByLabelText("Name"), "Blocked");
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    api.assignmentSupport.mockResolvedValue(true);
    await user.click(screen.getByRole("button", { name: "Retry support check" }));
    await openCreate();
  });

  it("blocks creation while the capability check is pending", async () => {
    api.assignmentSupport.mockReturnValue(new Promise(() => {}));
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New Policy" }));
    await user.type(screen.getByLabelText("Name"), "Blocked");
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("labels global, selected and unassigned scope, including legacy reads", async () => {
    api.assignmentSupport.mockRejectedValue(new Error("Older backend"));
    api.list.mockResolvedValue([
      policy,
      { ...policy, id: "p2", applies_to_all: true, scope_source: "legacy" },
      { ...policy, id: "p3", repository_ids: ["r1", "r2"] },
    ]);
    renderPage();
    expect(await screen.findByText("Unassigned - no effect")).toBeInTheDocument();
    expect(screen.getByText("Global - all current and future repositories")).toBeInTheDocument();
    expect(screen.getByText("Selected - 2 repositories")).toBeInTheDocument();
    expect(screen.getByText("Legacy scope (read-only)")).toBeInTheDocument();
  });

  it("shows create errors without dismissing the form", async () => {
    api.create.mockRejectedValue({ message: "Assignment support disappeared" });
    renderPage();
    const user = await openCreate();
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Assignment support disappeared"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows policy query errors rather than claiming no policies exist", async () => {
    api.list.mockRejectedValue(new Error("Cannot read policies"));
    renderPage();
    expect(await screen.findByText("Cannot read policies")).toBeInTheDocument();
    expect(screen.queryByText("No lifecycle policies")).not.toBeInTheDocument();
  });

  it("does not fetch admin data or offer controls to non-admins", () => {
    auth.user.is_admin = false;
    renderPage();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.assignmentSupport).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "New Policy" })).not.toBeInTheDocument();
  });
});

describe("LifecyclePage exclusions (#855)", () => {
  async function rejectCreate(message: string) {
    api.create.mockRejectedValue({ code: "VALIDATION_ERROR", message });
    renderPage();
    const user = await openCreate();
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    return user;
  }

  it("sends config.exclude alongside the policy config", async () => {
    renderPage();
    const user = await openCreate();
    await user.type(screen.getByLabelText("Keep these versions"), "latest");
    await user.click(screen.getByRole("button", { name: "Add version" }));
    await user.type(screen.getByLabelText("Keep versions matching"), "^v\\d+$");
    await user.click(screen.getByRole("button", { name: "Add pattern" }));
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith({
      name: "Cleanup",
      description: undefined,
      policy_type: "max_age_days",
      config: {
        days: 90,
        exclude: { versions: ["latest"], version_patterns: ["^v\\d+$"] },
      },
      applies_to_all: false,
      repository_ids: [],
    }));
  });

  it("offers the editor for every policy type", async () => {
    renderPage();
    const user = await openCreate();
    for (const type of Object.keys(POLICY_TYPE_LABELS) as PolicyType[]) {
      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByRole("option", { name: POLICY_TYPE_LABELS[type] }));
      expect(screen.getByLabelText("Keep these versions")).toBeInTheDocument();
      expect(screen.getByLabelText("Keep versions matching")).toBeInTheDocument();
    }
  });

  it("clears the exclusions after a successful create", async () => {
    renderPage();
    const user = await openCreate();
    await user.type(screen.getByLabelText("Keep these versions"), "latest");
    await user.click(screen.getByRole("button", { name: "Add version" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openCreate();
    expect(
      screen.queryByRole("button", { name: "Remove version latest" })
    ).not.toBeInTheDocument();
  });

  it("attaches a rejected config key to the config field", async () => {
    await rejectCreate(
      "unknown config key 'schedule' for policy_type 'max_age_days'. Allowed: days, max_age_days, exclude"
    );

    expect(screen.getByRole("alert")).toHaveTextContent("unknown config key 'schedule'");
    expect(screen.getByLabelText("Config (JSON)")).toHaveAttribute("aria-invalid", "true");
  });

  it("attaches a rejected exclusion pattern to the patterns list", async () => {
    await rejectCreate("Invalid regex in exclude.version_patterns: unclosed group");

    expect(screen.getByRole("alert")).toHaveTextContent("unclosed group");
    expect(screen.getByLabelText("Keep versions matching")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Config (JSON)")).not.toHaveAttribute("aria-invalid");
  });

  it("clears the field error when the dialog is reopened", async () => {
    const user = await rejectCreate("Invalid regex in exclude.version_patterns: unclosed group");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "New Policy" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("LifecyclePage preview figure (#855)", () => {
  it("reports the reclaimable size from bytes_matched, not the dry run's zero bytes_freed", async () => {
    api.list.mockResolvedValue([{ ...policy, name: "Drop old snapshots" }]);
    api.preview.mockResolvedValue({
      policy_id: "p1",
      policy_name: "Drop old snapshots",
      dry_run: true,
      artifacts_matched: 12,
      artifacts_removed: 0,
      bytes_matched: 1572864,
      bytes_freed: 0,
      errors: [],
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Preview policy Drop old snapshots (dry run)" })
    );

    expect(
      await screen.findByText(/Would delete 12 artifacts and reclaim 1\.5 MB/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/free 0 B/)).not.toBeInTheDocument();
  });
});
