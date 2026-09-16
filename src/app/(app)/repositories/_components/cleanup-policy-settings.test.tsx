// @vitest-environment jsdom
import React from "react";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { axe } from "jest-axe";
import type { LifecyclePolicy, ListPoliciesQuery } from "@/types/lifecycle";
import { CleanupPolicySettings } from "./cleanup-policy-settings";

const { api, auth } = vi.hoisted(() => ({
  api: { list: vi.fn(), assignmentSupport: vi.fn(), attach: vi.fn(), detach: vi.fn() },
  auth: { user: { is_admin: true } },
}));
vi.mock("@/lib/api/lifecycle", () => ({ lifecycleApi: api }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

const base: LifecyclePolicy = {
  id: "dormant", name: "Dormant", repository_id: null,
  applies_to_all: false, repository_ids: [], scope_source: "explicit",
  description: null, enabled: true, policy_type: "max_age_days",
  config: { days: 30 }, priority: 1,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  last_run_at: null, last_run_items_removed: null,
};
let policies: LifecyclePolicy[];

function renderSettings(repositoryId = "r1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={client}>
      <CleanupPolicySettings repositoryId={repositoryId} />
    </QueryClientProvider>
  );
  return { ...view, client, invalidate };
}

async function choosePolicy(name: string) {
  const user = userEvent.setup();
  const picker = await screen.findByRole("combobox", { name: "Attach an existing cleanup policy" });
  await waitFor(() => expect(picker).toBeEnabled());
  await user.click(picker);
  await user.click(screen.getByRole("option", { name: new RegExp(name) }));
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.user.is_admin = true;
  policies = [
    base,
    { ...base, id: "global", name: "Global cleanup", applies_to_all: true },
    { ...base, id: "shared", name: "Shared cleanup", repository_ids: ["r1", "r2"] },
    { ...base, id: "disabled", name: "Disabled cleanup", repository_ids: ["r2"], enabled: false },
  ];
  api.assignmentSupport.mockResolvedValue(true);
  api.list.mockImplementation(async (query?: ListPoliciesQuery) =>
    query?.repository_id
      ? policies.filter((p) => p.applies_to_all || p.repository_ids.includes(query.repository_id!))
      : policies,
  );
  api.attach.mockImplementation(async (id: string, repositoryId: string) => {
    policies = policies.map((p) => p.id === id ? { ...p, repository_ids: [...p.repository_ids, repositoryId] } : p);
    return policies.find((p) => p.id === id);
  });
  api.detach.mockImplementation(async (id: string, repositoryId: string) => {
    policies = policies.map((p) => p.id === id ? { ...p, repository_ids: p.repository_ids.filter((r) => r !== repositoryId) } : p);
    return policies.find((p) => p.id === id);
  });
});
afterEach(cleanup);

describe("Repository cleanup assignments", () => {
  it("lists effective scope and never offers global detach or policy-wide destructive buttons", async () => {
    renderSettings();
    expect(await screen.findByText("Global cleanup")).toBeInTheDocument();
    expect(screen.getByText("Shared cleanup")).toBeInTheDocument();
    expect(screen.getByText(/Inherited global policy/)).toBeInTheDocument();
    expect(screen.getByText("Selected - 2 repositories")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /detach policy global/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute|preview|delete/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lifecycle administration/ })).toHaveAttribute("href", "/lifecycle");
    expect(api.list).toHaveBeenCalledWith({ repository_id: "r1" });
  });

  it("offers dormant and other-repository policies, not inherited or already assigned policies", async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("combobox", { name: "Attach an existing cleanup policy" }));
    expect(screen.getByRole("option", { name: /Dormant.*Unassigned - no effect/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Disabled cleanup.*Selected - 1 repository; disabled/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Global cleanup|Shared cleanup/ })).not.toBeInTheDocument();
  });

  it("attaches an unassigned policy and refreshes both effective and global lists", async () => {
    const { invalidate } = renderSettings();
    const user = await choosePolicy("Dormant");
    await user.click(screen.getByRole("button", { name: "Attach policy" }));
    await waitFor(() => expect(api.attach).toHaveBeenCalledWith("dormant", "r1"));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["lifecycle-policies"] }));
    expect(await screen.findByRole("button", { name: "Detach policy Dormant" })).toBeEnabled();
    expect(policies.find((p) => p.id === "dormant")?.repository_ids).toEqual(["r1"]);
  });

  it("attaches an existing disabled policy without changing its enabled state or other membership", async () => {
    renderSettings();
    const user = await choosePolicy("Disabled cleanup");
    await user.click(screen.getByRole("button", { name: "Attach policy" }));
    await waitFor(() => expect(api.attach).toHaveBeenCalledWith("disabled", "r1"));
    expect(await screen.findByRole("button", { name: "Detach policy Disabled cleanup" })).toBeEnabled();
    expect(policies.find((p) => p.id === "disabled")).toMatchObject({ enabled: false, repository_ids: ["r2", "r1"] });
  });

  it("confirms detachment, preserves other assignments and explains in-flight runs", async () => {
    const { invalidate } = renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Detach policy Shared cleanup" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Runs already in progress may still clean up this repository/)).toBeInTheDocument();
    expect(api.detach).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Detach policy" }));
    await waitFor(() => expect(api.detach).toHaveBeenCalledWith("shared", "r1"));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["lifecycle-policies"] }));
    await waitFor(() => expect(screen.queryByText("Shared cleanup")).not.toBeInTheDocument());
    expect(policies.find((p) => p.id === "shared")?.repository_ids).toEqual(["r2"]);
  });

  it("does not detach on cancel", async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Detach policy Shared cleanup" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(api.detach).not.toHaveBeenCalled();
    expect(screen.getByText("Shared cleanup")).toBeInTheDocument();
  });

  it("returns the policy to an unassigned reusable state after detaching its last repository", async () => {
    policies = [{ ...base, name: "Last assignment", repository_ids: ["r1"] }];
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Detach policy Last assignment" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Detach policy" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByText("No cleanup policies apply to this repository.")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Last assignment (Unassigned - no effect)" })).toBeInTheDocument();
    expect(policies[0]).toMatchObject({ applies_to_all: false, repository_ids: [] });
  });

  it("surfaces a rejected attachment without claiming success or changing scope", async () => {
    api.attach.mockRejectedValue({ message: "Policy is now global" });
    renderSettings();
    const user = await choosePolicy("Dormant");
    await user.click(screen.getByRole("button", { name: "Attach policy" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Policy is now global"));
    expect(screen.queryByRole("button", { name: "Detach policy Dormant" })).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps the confirmation and membership on failed detach", async () => {
    api.detach.mockRejectedValue({ message: "Permission denied" });
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Detach policy Shared cleanup" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Detach policy" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Permission denied"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(policies.find((p) => p.id === "shared")?.repository_ids).toEqual(["r1", "r2"]);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("blocks duplicate attachment while a request is pending", async () => {
    api.attach.mockReturnValue(new Promise(() => {}));
    renderSettings();
    const user = await choosePolicy("Dormant");
    await user.click(screen.getByRole("button", { name: "Attach policy" }));
    expect(await screen.findByRole("button", { name: "Attaching..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Detach policy Shared cleanup" })).toBeDisabled();
    expect(api.attach).toHaveBeenCalledOnce();
  });

  it("keeps legacy scope viewable when capability lookup fails, without assignment controls", async () => {
    policies = policies.map((p) => ({ ...p, scope_source: "legacy" }));
    api.assignmentSupport.mockRejectedValue(new Error("Backend does not support assignments"));
    renderSettings();
    expect(await screen.findByText("Backend does not support assignments")).toBeInTheDocument();
    expect(screen.getByText("Shared cleanup")).toBeInTheDocument();
    expect(screen.getAllByText(/Legacy scope \(read-only\)/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Detach|Attach policy/ })).not.toBeInTheDocument();
    expect(api.attach).not.toHaveBeenCalled();
  });

  it("shows read errors instead of an empty effective policy list", async () => {
    api.list.mockRejectedValue(new Error("Policies unavailable"));
    renderSettings();
    expect(await screen.findByText("Could not load cleanup policies")).toBeInTheDocument();
    expect(screen.queryByText("No cleanup policies apply to this repository.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attach policy" })).not.toBeInTheDocument();
  });

  it("disables all changes while capability support is unknown, even with cached policies", async () => {
    api.assignmentSupport.mockReturnValue(new Promise(() => {}));
    renderSettings();
    expect(await screen.findByRole("button", { name: "Detach policy Shared cleanup" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Attach policy" })).not.toBeInTheDocument();
  });

  it("does not fetch admin data or expose controls to non-admins", () => {
    auth.user.is_admin = false;
    renderSettings();
    expect(screen.getByText(/Administrator access is required/)).toBeInTheDocument();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.assignmentSupport).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("has accessible controls and confirmation", async () => {
    const { container } = renderSettings();
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "Attach an existing cleanup policy" });
    expect((await axe(container)).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Detach policy Shared cleanup" }));
    expect((await axe(screen.getByRole("alertdialog"))).violations).toEqual([]);
  });
});
