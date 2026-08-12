/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type {
  CiOidcProvider,
  CiOidcIdentityMapping,
} from "@/types/ci-oidc";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCiOidcApi = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  enableProvider: vi.fn(),
  disableProvider: vi.fn(),
  listMappings: vi.fn(),
  getMapping: vi.fn(),
  createMapping: vi.fn(),
  updateMapping: vi.fn(),
  deleteMapping: vi.fn(),
  enableMapping: vi.fn(),
  disableMapping: vi.fn(),
};

vi.mock("@/lib/api/ci-oidc", () => ({
  ciOidcApi: mockCiOidcApi,
}));

const mockUseRepositories = vi.fn();
vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: (...args: unknown[]) => mockUseRepositories(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/error-utils", () => ({
  mutationErrorToast: () => () => {},
}));

// Mock UI primitives for predictable jsdom rendering
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => {
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  );
  return {
    Select,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked ?? false}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    title,
  }: {
    open: boolean;
    onConfirm: () => void;
    title: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm Delete</button>
      </div>
    ) : null,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_PROVIDER: CiOidcProvider = {
  id: "p1",
  name: "GitLab Prod",
  provider_type: "gitlab",
  issuer_url: "https://gitlab.com",
  audience: "artifact-keeper",
  is_enabled: true,
  mapping_count: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const MOCK_MAPPING: CiOidcIdentityMapping = {
  id: "m1",
  provider_id: "p1",
  name: "Prod Deployment",
  priority: 10,
  claim_filters: { namespace_path: "org/project" },
  allowed_repo_ids: ["r1"],
  is_enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const MOCK_REPOSITORIES = {
  items: [
    { id: "r1", key: "docker-local", name: "Docker Local" },
    { id: "r2", key: "maven-local", name: "Maven Local" },
  ],
  pagination: { page: 1, per_page: 500, total: 2, total_pages: 1 },
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

let CiOidcPage: React.ComponentType;

async function renderPage() {
  const qc = newQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <CiOidcPage />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CiOidcPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockCiOidcApi.list.mockResolvedValue([MOCK_PROVIDER]);
    mockCiOidcApi.listMappings.mockResolvedValue([MOCK_MAPPING]);
    mockUseRepositories.mockReturnValue({
      data: MOCK_REPOSITORIES,
      isLoading: false,
    });

    const mod = await import("../page");
    CiOidcPage = mod.default;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders page title and list of configured providers", async () => {
    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("CI / CD OIDC Providers")).toBeTruthy();
      expect(screen.getByText("GitLab Prod")).toBeTruthy();
      expect(screen.getByText("https://gitlab.com")).toBeTruthy();
    });
  });

  it("opens create provider dialog and submits new provider", async () => {
    const user = userEvent.setup();
    mockCiOidcApi.create.mockResolvedValue({ ...MOCK_PROVIDER, id: "p2", name: "GitHub Actions" });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("GitLab Prod")).toBeTruthy();
    });

    const addBtn = screen.getByRole("button", { name: /Add Provider/i });
    await user.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText("Add CI OIDC Provider")).toBeTruthy();
    });

    const nameInput = screen.getByLabelText(/^Name$/i);
    const issuerInput = screen.getByLabelText(/Issuer URL/i);

    await user.type(nameInput, "GitHub Actions");
    await user.type(issuerInput, "https://token.actions.githubusercontent.com");

    const submitBtn = screen.getByRole("button", { name: /Create Provider/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCiOidcApi.create).toHaveBeenCalled();
      expect(mockCiOidcApi.create.mock.calls[0][0]).toEqual({
        name: "GitHub Actions",
        provider_type: "generic",
        issuer_url: "https://token.actions.githubusercontent.com",
        audience: "artifact-keeper",
      });
    });
  });

  it("opens edit provider dialog and updates provider settings", async () => {
    const user = userEvent.setup();
    mockCiOidcApi.update.mockResolvedValue({ ...MOCK_PROVIDER, name: "GitLab Updated" });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("GitLab Prod")).toBeTruthy();
    });

    // Find the pencil icon button for editing provider
    const editBtns = screen.getAllByRole("button");
    const editBtn = editBtns.find((b) => b.querySelector(".lucide-pencil"));
    expect(editBtn).toBeTruthy();
    await user.click(editBtn!);

    await waitFor(() => {
      expect(screen.getByText("Edit CI OIDC Provider")).toBeTruthy();
    });

    const nameInput = screen.getByLabelText(/^Name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "GitLab Updated");

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockCiOidcApi.update).toHaveBeenCalled();
      expect(mockCiOidcApi.update.mock.calls[0][0]).toBe("p1");
      expect(mockCiOidcApi.update.mock.calls[0][1]).toEqual({
        name: "GitLab Updated",
        provider_type: "gitlab",
        issuer_url: "https://gitlab.com",
        audience: "artifact-keeper",
      });
    });
  });

  it("deletes a provider when confirmed", async () => {
    const user = userEvent.setup();
    mockCiOidcApi.delete.mockResolvedValue(undefined);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("GitLab Prod")).toBeTruthy();
    });

    const trashBtns = screen.getAllByRole("button");
    const trashBtn = trashBtns.find((b) => b.querySelector(".lucide-trash-2"));
    expect(trashBtn).toBeTruthy();
    await user.click(trashBtn!);

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
    });

    const confirmBtn = screen.getByRole("button", { name: /Confirm Delete/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockCiOidcApi.delete).toHaveBeenCalled();
      expect(mockCiOidcApi.delete.mock.calls[0][0]).toBe("p1");
    });
  });

  it("toggles provider active state", async () => {
    const user = userEvent.setup();
    mockCiOidcApi.disableProvider.mockResolvedValue(undefined);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("GitLab Prod")).toBeTruthy();
    });

    const toggleBtn = screen.getAllByRole("button").find((b) => b.querySelector(".lucide-toggle-right"));
    expect(toggleBtn).toBeTruthy();
    await user.click(toggleBtn!);

    await waitFor(() => {
      expect(mockCiOidcApi.disableProvider).toHaveBeenCalled();
      expect(mockCiOidcApi.disableProvider.mock.calls[0][0]).toBe("p1");
    });
  });

  it("renders mappings and allows creating a new mapping", async () => {
    const user = userEvent.setup();
    mockCiOidcApi.createMapping.mockResolvedValue({ ...MOCK_MAPPING, id: "m2", name: "New Mapping" });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Prod Deployment")).toBeTruthy();
    });

    const addMappingBtn = screen.getByRole("button", { name: /Add Mapping/i });
    await user.click(addMappingBtn);

    await waitFor(() => {
      expect(screen.getByText("Add Identity Mapping")).toBeTruthy();
    });

    const nameInput = screen.getByLabelText(/^Name$/i);
    await user.type(nameInput, "New Mapping");

    const saveBtn = screen.getByRole("button", { name: /Create Mapping/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockCiOidcApi.createMapping).toHaveBeenCalled();
      expect(mockCiOidcApi.createMapping.mock.calls[0][0]).toBe("p1");
      expect(mockCiOidcApi.createMapping.mock.calls[0][1]).toEqual({
        name: "New Mapping",
        priority: 100,
        claim_filters: { namespace_path: "my-org/my-group", ref_protected: "true" },
        allowed_repo_ids: null,
        is_enabled: true,
      });
    });
  });

  it("validates claim_filters JSON in mapping dialog", async () => {
    const user = userEvent.setup();

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Prod Deployment")).toBeTruthy();
    });

    const addMappingBtn = screen.getByRole("button", { name: /Add Mapping/i });
    await user.click(addMappingBtn);

    await waitFor(() => {
      expect(screen.getByText("Add Identity Mapping")).toBeTruthy();
    });

    const nameInput = screen.getByLabelText(/^Name$/i);
    await user.type(nameInput, "Invalid Test");

    // Enter invalid JSON
    const jsonArea = screen.getByLabelText(/Claim Filters/i);
    await user.clear(jsonArea);
    await user.type(jsonArea, "{{ invalid json");

    const saveBtn = screen.getByRole("button", { name: /Create Mapping/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Invalid JSON — please fix claim_filters before saving.")).toBeTruthy();
      expect(mockCiOidcApi.createMapping).not.toHaveBeenCalled();
    });
  });

  it("rejects a priority below 1 in mapping dialog", async () => {
    const user = userEvent.setup();

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Prod Deployment")).toBeTruthy();
    });

    const addMappingBtn = screen.getByRole("button", { name: /Add Mapping/i });
    await user.click(addMappingBtn);

    await waitFor(() => {
      expect(screen.getByText("Add Identity Mapping")).toBeTruthy();
    });

    const nameInput = screen.getByLabelText(/^Name$/i);
    await user.type(nameInput, "Invalid Test");

    // Set priority to 0 via the underlying input value.
    const priorityInput = screen.getByLabelText(/Priority/i);
    fireEvent.change(priorityInput, { target: { value: "0" } });

    const saveBtn = screen.getByRole("button", { name: /Create Mapping/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Priority must be a positive integer (>= 1).")).toBeTruthy();
      expect(mockCiOidcApi.createMapping).not.toHaveBeenCalled();
    });
  });

  it("edits mapping and sends allowed_repo_ids: [] when switching from selected to all repos (bug fix verification)", async () => {
    const user = userEvent.setup();
    mockCiOidcApi.updateMapping.mockResolvedValue({ ...MOCK_MAPPING, allowed_repo_ids: null });

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Prod Deployment")).toBeTruthy();
    });

    // Find the edit button inside MappingsPanel table
    const editBtns = screen.getAllByRole("button");
    const editMappingBtn = editBtns.find(
      (b) => b.querySelector(".lucide-pencil") && b.closest("table"),
    );
    expect(editMappingBtn).toBeTruthy();
    await user.click(editMappingBtn!);

    await waitFor(() => {
      expect(screen.getByText("Edit Identity Mapping")).toBeTruthy();
    });

    // Switch repo scope mode from "selected" to "all"
    const selects = screen.getAllByRole("combobox");
    const repoScopeSelect = selects[selects.length - 1];
    await user.selectOptions(repoScopeSelect, "all");

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockCiOidcApi.updateMapping).toHaveBeenCalled();
      expect(mockCiOidcApi.updateMapping.mock.calls[0][0]).toBe("p1");
      expect(mockCiOidcApi.updateMapping.mock.calls[0][1]).toBe("m1");
      expect(mockCiOidcApi.updateMapping.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          allowed_repo_ids: [],
        }),
      );
    });
  });

  it("toggles and deletes identity mapping", async () => {
    const user = userEvent.setup();
    mockCiOidcApi.disableMapping.mockResolvedValue(undefined);
    mockCiOidcApi.deleteMapping.mockResolvedValue(undefined);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("Prod Deployment")).toBeTruthy();
    });

    // Find toggle button inside mappings table
    const mappingRow = screen.getByText("Prod Deployment").closest("tr");
    const toggleMappingBtn = mappingRow?.querySelector(".lucide-toggle-right")?.closest("button");
    expect(toggleMappingBtn).toBeTruthy();
    await user.click(toggleMappingBtn!);

    await waitFor(() => {
      expect(mockCiOidcApi.disableMapping).toHaveBeenCalled();
      expect(mockCiOidcApi.disableMapping.mock.calls[0][0]).toBe("p1");
      expect(mockCiOidcApi.disableMapping.mock.calls[0][1]).toBe("m1");
    });

    // Delete mapping
    const deleteMappingBtn = mappingRow?.querySelector(".lucide-trash-2")?.closest("button");
    expect(deleteMappingBtn).toBeTruthy();
    await user.click(deleteMappingBtn!);

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
    });

    const confirmBtn = screen.getByRole("button", { name: /Confirm Delete/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockCiOidcApi.deleteMapping).toHaveBeenCalled();
      expect(mockCiOidcApi.deleteMapping.mock.calls[0][0]).toBe("p1");
      expect(mockCiOidcApi.deleteMapping.mock.calls[0][1]).toBe("m1");
    });
  });

  it("shows empty state when no providers exist", async () => {
    mockCiOidcApi.list.mockResolvedValue([]);

    await renderPage();

    await waitFor(() => {
      expect(screen.getByText("No CI OIDC providers configured yet.")).toBeTruthy();
    });
  });
});