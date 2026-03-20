/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks -- all vi.mock calls are hoisted by vitest
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockPermissionsApi = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
vi.mock("@/lib/api/permissions", () => ({
  permissionsApi: mockPermissionsApi,
}));

const mockRepositoriesApi = { list: vi.fn() };
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: mockRepositoriesApi,
}));

const mockGroupsApi = { list: vi.fn() };
vi.mock("@/lib/api/groups", () => ({
  groupsApi: mockGroupsApi,
}));

const mockAdminApi = { listUsers: vi.fn() };
vi.mock("@/lib/api/admin", () => ({
  adminApi: mockAdminApi,
}));

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: mockToast }));

// -- Radix UI Select replaced with native <select> for testability ----------
// Native <select> has implicit role "combobox" in accessibility tree.
vi.mock("@/components/ui/select", () => {
  function Select({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
  }) {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onValueChange?.(e.target.value)}
        disabled={disabled ?? false}
        data-slot="mock-select"
      >
        <option value="">--</option>
        {children}
      </select>
    );
  }
  // SelectTrigger and SelectValue become no-ops; the native <select> handles display.
  // We avoid rendering <span> inside <select> (invalid HTML).
  function SelectTrigger({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function SelectValue(_props: { placeholder?: string }) {
    return null;
  }
  function SelectContent({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function SelectItem({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) {
    return <option value={value}>{children}</option>;
  }
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

// -- Radix UI Checkbox replaced with native <input type="checkbox"> ---------
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked ?? false}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

// -- Dialog replaced with a simple conditional div --------------------------
vi.mock("@/components/ui/dialog", () => ({
  Dialog({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
  }) {
    return open ? <div role="dialog">{children}</div> : null;
  },
  DialogContent({ children }: { children: React.ReactNode; className?: string }) {
    return <div>{children}</div>;
  },
  DialogHeader({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  },
  DialogTitle({ children }: { children: React.ReactNode }) {
    return <h2>{children}</h2>;
  },
  DialogDescription({ children }: { children: React.ReactNode }) {
    return <p>{children}</p>;
  },
  DialogFooter({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  },
}));

// -- Tooltip renders children inline ----------------------------------------
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  },
  TooltipTrigger({ children }: { children: React.ReactNode; asChild?: boolean }) {
    return <>{children}</>;
  },
  TooltipContent({ children }: { children: React.ReactNode }) {
    return <span className="tooltip-text">{children}</span>;
  },
}));

// -- ConfirmDialog ----------------------------------------------------------
vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog({
    open,
    onConfirm,
    title,
  }: {
    open: boolean;
    onConfirm: () => void;
    title: string;
    description?: string;
    onOpenChange?: (o: boolean) => void;
    confirmText?: string;
    danger?: boolean;
    loading?: boolean;
  }) {
    if (!open) return null;
    return (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm Delete</button>
      </div>
    );
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_USER = {
  id: "user-1",
  username: "admin",
  email: "admin@test.com",
  display_name: "Admin User",
  is_admin: true,
};

const MOCK_USERS = [
  { id: "user-1", username: "admin", email: "admin@test.com", display_name: "Admin User", is_admin: true },
  { id: "user-2", username: "alice", email: "alice@test.com", display_name: "Alice", is_admin: false },
];

const MOCK_GROUPS = [
  { id: "grp-1", name: "Developers", description: "", auto_join: false, member_count: 3, is_external: false, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: "grp-2", name: "QA Team", description: "", auto_join: false, member_count: 2, is_external: false, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
];

const MOCK_REPOS = [
  { id: "repo-1", key: "npm-local", name: "NPM Local", format: "npm" as const, repo_type: "local" as const, is_public: false, storage_used_bytes: 0, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: "repo-2", key: "maven-remote", name: "", format: "maven" as const, repo_type: "remote" as const, is_public: true, storage_used_bytes: 0, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
];

const PERM_1 = {
  id: "perm-1",
  principal_type: "user" as const,
  principal_id: "user-2",
  principal_name: "Alice",
  target_type: "repository" as const,
  target_id: "repo-1",
  target_name: "npm-local",
  actions: ["read", "write"] as ("read" | "write" | "delete" | "admin")[],
  created_at: "2025-01-15T00:00:00Z",
  updated_at: "2025-01-15T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

let PermissionsPage: React.ComponentType;

function renderPage() {
  const qc = newQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <PermissionsPage />
    </QueryClientProvider>,
  );
}

/** Wait for the table to show data (the principal_name "Alice" from PERM_1). */
async function waitForTableLoaded() {
  await waitFor(() => {
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
  });
}

/**
 * Open the Create Permission dialog by clicking the header button, then
 * wait for the dialog description to confirm it is visible.
 */
async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByText(/Create Permission/);
  await user.click(buttons[0]);
  await waitFor(() => {
    expect(
      screen.getByText("Grant a user or group access to a target resource."),
    ).toBeTruthy();
  });
}

/**
 * Return all native <select> elements inside a dialog.
 * In the create/edit form the order is:
 *   [0] principal_type   [1] principal_id
 *   [2] target_type      [3] target_id (absent when target_type=artifact)
 */
function getFormSelects(): HTMLSelectElement[] {
  const dialog = screen.getByRole("dialog");
  return Array.from(dialog.querySelectorAll("select"));
}

/**
 * Find the action-column button for a row by looking for the adjacent
 * tooltip text ("Edit" or "Delete").
 */
function findActionButton(tooltipLabel: string): HTMLElement {
  // Our tooltip mock renders: <Button /><span class="tooltip-text">Label</span>
  // Both are direct children of the Tooltip fragment.
  const spans = screen.getAllByText(tooltipLabel).filter(
    (el) => el.classList.contains("tooltip-text"),
  );
  const btn = spans[0]?.previousElementSibling as HTMLElement | null;
  if (!btn) throw new Error(`Could not find action button for "${tooltipLabel}"`);
  return btn;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();

  mockUseAuth.mockReturnValue({ user: ADMIN_USER });

  mockPermissionsApi.list.mockResolvedValue({
    items: [PERM_1],
    pagination: { page: 1, per_page: 1000, total: 1, total_pages: 1 },
  });
  mockAdminApi.listUsers.mockResolvedValue(MOCK_USERS);
  mockGroupsApi.list.mockResolvedValue({
    items: MOCK_GROUPS,
    pagination: { page: 1, per_page: 1000, total: 2, total_pages: 1 },
  });
  mockRepositoriesApi.list.mockResolvedValue({
    items: MOCK_REPOS,
    pagination: { page: 1, per_page: 1000, total: 2, total_pages: 1 },
  });

  const mod = await import("./page");
  PermissionsPage = mod.default;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PermissionsPage", () => {
  // -- basic rendering ------------------------------------------------------

  it("renders page header and create button for admin users", async () => {
    renderPage();
    await waitForTableLoaded();
    expect(screen.getByText("Permissions")).toBeTruthy();
    expect(screen.getAllByText(/Create Permission/).length).toBeGreaterThan(0);
  });

  it("shows access denied for non-admin users", () => {
    mockUseAuth.mockReturnValue({ user: { ...ADMIN_USER, is_admin: false } });
    renderPage();
    expect(
      screen.getByText("You must be an administrator to view this page."),
    ).toBeTruthy();
  });

  it("renders permission rows once data loads", async () => {
    renderPage();
    await waitForTableLoaded();
    expect(screen.getAllByText("npm-local").length).toBeGreaterThan(0);
  });

  it("shows empty state when no permissions exist", async () => {
    mockPermissionsApi.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, per_page: 1000, total: 0, total_pages: 0 },
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No permissions configured")).toBeTruthy();
    });
  });

  // -- target type switching (PR #186) --------------------------------------

  describe("target type switching", () => {
    it("default target type is repository, showing a Select dropdown with repo label", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTableLoaded();
      await openCreateDialog(user);

      // The label for the target field should be "Repository" (a <label> element)
      const labels = screen.getAllByText("Repository");
      const labelEl = labels.find((el) => el.tagName === "LABEL");
      expect(labelEl).toBeTruthy();

      // The target_type select should have value "repository"
      const selects = getFormSelects();
      expect(selects[2].value).toBe("repository");
    });

    it("shows text input with placeholder Artifact UUID for artifact target type", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTableLoaded();
      await openCreateDialog(user);

      const selects = getFormSelects();
      await user.selectOptions(selects[2], "artifact");

      // Label should change to "Artifact ID"
      expect(screen.getByText("Artifact ID")).toBeTruthy();
      // A text input with the UUID placeholder should appear
      expect(screen.getByPlaceholderText("Artifact UUID")).toBeTruthy();
      // The target_id select should be replaced by the input, so only 3 selects remain
      expect(getFormSelects().length).toBe(3);
    });

    it("shows Target Group label and group select for group target type", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTableLoaded();
      await openCreateDialog(user);

      const selects = getFormSelects();
      await user.selectOptions(selects[2], "group");

      expect(screen.getByText("Target Group")).toBeTruthy();

      // The target_id select should contain group options
      const updatedSelects = getFormSelects();
      const targetIdSelect = updatedSelects[3];
      const options = Array.from(targetIdSelect.querySelectorAll("option"));
      expect(options.some((o) => o.value === "grp-1")).toBe(true);
      expect(options.some((o) => o.textContent === "Developers")).toBe(true);
    });

    it("clears target_id when target_type changes", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTableLoaded();
      await openCreateDialog(user);

      const selects = getFormSelects();
      const targetTypeSelect = selects[2];
      const targetIdSelect = selects[3];

      // Pick a repository
      await user.selectOptions(targetIdSelect, "repo-1");
      expect(targetIdSelect.value).toBe("repo-1");

      // Switch target type to group -- should reset target_id to ""
      await user.selectOptions(targetTypeSelect, "group");

      const refreshed = getFormSelects();
      expect(refreshed[3].value).toBe("");
    });
  });

  // -- repository options loading (PR #186) ---------------------------------

  describe("repository options", () => {
    it("renders repository entries as option elements in the target select", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTableLoaded();
      await openCreateDialog(user);

      const selects = getFormSelects();
      const targetIdSelect = selects[3];
      const options = Array.from(targetIdSelect.querySelectorAll("option"));
      expect(options.some((o) => o.value === "repo-1")).toBe(true);
      expect(options.some((o) => o.value === "repo-2")).toBe(true);
    });

    it("formats label as key + name when the repo has a name", async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForTableLoaded();
      await openCreateDialog(user);

      const selects = getFormSelects();
      const targetIdSelect = selects[3];
      const options = Array.from(targetIdSelect.querySelectorAll("option"));
      const npmOpt = options.find((o) => o.value === "repo-1");
      expect(npmOpt?.textContent).toContain("npm-local");
      expect(npmOpt?.textContent).toContain("NPM Local");
    });
  });

  // -- edit sends full payload (PR #186) ------------------------------------

  describe("edit submit sends full payload", () => {
    it("calls permissionsApi.update with all five fields", async () => {
      const user = userEvent.setup();
      mockPermissionsApi.update.mockResolvedValue(PERM_1);
      renderPage();
      await waitForTableLoaded();

      await user.click(findActionButton("Edit"));
      await waitFor(() => {
        expect(screen.getByText("Edit Permission")).toBeTruthy();
      });

      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockPermissionsApi.update).toHaveBeenCalledTimes(1);
      });
      expect(mockPermissionsApi.update).toHaveBeenCalledWith("perm-1", {
        principal_type: "user",
        principal_id: "user-2",
        target_type: "repository",
        target_id: "repo-1",
        actions: ["read", "write"],
      });
    });
  });

  // -- error messages (PR #186) ---------------------------------------------

  describe("error messages on mutation failure", () => {
    it("surfaces Error.message on create failure", async () => {
      const user = userEvent.setup();
      mockPermissionsApi.create.mockRejectedValue(
        new Error("Principal already has this permission"),
      );
      renderPage();
      await waitForTableLoaded();
      await openCreateDialog(user);

      // Fill required fields via the native selects inside the dialog
      const selects = getFormSelects();
      await user.selectOptions(selects[1], "user-2"); // principal_id
      await user.selectOptions(selects[3], "repo-1"); // target_id

      // Click submit -- the last "Create Permission" match is the form button
      const submitBtns = screen.getAllByText(/Create Permission/);
      await user.click(submitBtns[submitBtns.length - 1]);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          "Principal already has this permission",
        );
      });
    });

    it("falls back to generic message when error is not an Error instance", async () => {
      const user = userEvent.setup();
      mockPermissionsApi.create.mockRejectedValue("raw string error");
      renderPage();
      await waitForTableLoaded();
      await openCreateDialog(user);

      const selects = getFormSelects();
      await user.selectOptions(selects[1], "user-2");
      await user.selectOptions(selects[3], "repo-1");

      const submitBtns = screen.getAllByText(/Create Permission/);
      await user.click(submitBtns[submitBtns.length - 1]);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          "Failed to create permission",
        );
      });
    });

    it("surfaces Error.message on update failure", async () => {
      const user = userEvent.setup();
      mockPermissionsApi.update.mockRejectedValue(
        new Error("Conflict: duplicate permission"),
      );
      renderPage();
      await waitForTableLoaded();

      await user.click(findActionButton("Edit"));
      await waitFor(() => {
        expect(screen.getByText("Edit Permission")).toBeTruthy();
      });

      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          "Conflict: duplicate permission",
        );
      });
    });
  });

  // -- delete ---------------------------------------------------------------

  describe("delete flow", () => {
    it("opens confirm dialog and calls delete on confirm", async () => {
      const user = userEvent.setup();
      mockPermissionsApi.delete.mockResolvedValue(undefined);
      renderPage();
      await waitForTableLoaded();

      await user.click(findActionButton("Delete"));

      await waitFor(() => {
        expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
      });

      await user.click(screen.getByText("Confirm Delete"));

      await waitFor(() => {
        expect(mockPermissionsApi.delete).toHaveBeenCalledWith("perm-1");
      });
    });
  });
});
