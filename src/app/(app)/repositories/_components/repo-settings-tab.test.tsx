// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RepoSettingsTab } from "./repo-settings-tab";
import type { Repository } from "@/types";

// jsdom doesn't provide ResizeObserver
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock repositories API
const mockUpdate = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

// Mock lifecycle API
const mockListPolicies = vi.fn();
const mockDeletePolicy = vi.fn();
const mockExecutePolicy = vi.fn();
const mockPreviewPolicy = vi.fn();
vi.mock("@/lib/api/lifecycle", () => ({
  default: {
    list: (...args: unknown[]) => mockListPolicies(...args),
    delete: (...args: unknown[]) => mockDeletePolicy(...args),
    execute: (...args: unknown[]) => mockExecutePolicy(...args),
    preview: (...args: unknown[]) => mockPreviewPolicy(...args),
  },
}));

// Mock error utils
vi.mock("@/lib/error-utils", () => ({
  toUserMessage: (_err: unknown, fallback: string) => fallback,
}));

// Mock utils
vi.mock("@/lib/utils", () => ({
  formatBytes: (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${bytes} B`;
  },
  REPO_TYPE_COLORS: {},
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// Replace Radix Select with native <select>
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => {
    const items: Array<{ value: string; label: string }> = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const content = child as React.ReactElement<{
          children: React.ReactNode;
        }>;
        React.Children.forEach(content.props.children, (item) => {
          if (
            React.isValidElement(item) &&
            (item.props as Record<string, unknown>).value
          ) {
            const props = item.props as {
              value: string;
              children: React.ReactNode;
            };
            items.push({ value: props.value, label: String(props.children) });
          }
        });
      }
    });
    return (
      <select
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        data-testid="mock-select"
      >
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

// Mock Tooltip (render children only)
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span className="tooltip-content">{children}</span>
  ),
}));

// Mock AlertDialog
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  AlertDialogTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

// Mock Separator
vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

const baseRepo: Repository = {
  id: "repo-1",
  key: "maven-releases",
  name: "Maven Releases",
  description: "Production Maven artifacts",
  format: "maven",
  repo_type: "local",
  is_public: true,
  storage_used_bytes: 5368709120, // 5 GB
  quota_bytes: 10737418240, // 10 GB
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-06-20T14:30:00Z",
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return TestWrapper;
}

describe("RepoSettingsTab - General Section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
  });

  it("renders general settings fields with repository values", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByLabelText("Repository Key")).toHaveProperty(
      "value",
      "maven-releases"
    );
    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "Maven Releases"
    );
    expect(screen.getByLabelText("Description")).toHaveProperty(
      "value",
      "Production Maven artifacts"
    );
    expect(
      screen.getByLabelText("Public Access").getAttribute("aria-checked")
    ).toBe("true");
  });

  it("renders the General section heading", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getAllByText("General").length).toBeGreaterThan(0);
  });

  it("shows unsaved changes bar when name is modified", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByText("You have unsaved changes")).toBeNull();

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Maven");

    expect(screen.getByText("You have unsaved changes")).toBeTruthy();
  });

  it("shows key change warning when key is modified", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const keyInput = screen.getByLabelText("Repository Key");
    await user.clear(keyInput);
    await user.type(keyInput, "new-key");

    expect(
      screen.getByText(/changing the key will update all urls/i)
    ).toBeTruthy();
  });

  it("strips invalid characters from key input", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const keyInput = screen.getByLabelText("Repository Key");
    await user.clear(keyInput);
    await user.type(keyInput, "My Repo!");

    // Only lowercase alphanumeric, hyphens, and underscores should remain
    expect((keyInput as HTMLInputElement).value).toBe("myrepo");
  });

  it("discards changes when discard button is clicked", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Changed");

    expect(screen.getByText("You have unsaved changes")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.queryByText("You have unsaved changes")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "Maven Releases"
    );
  });

  it("calls repositoriesApi.update on save", async () => {
    mockUpdate.mockResolvedValue({
      ...baseRepo,
      name: "Updated Maven",
    });

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Maven");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("maven-releases", {
        name: "Updated Maven",
      });
    });
  });

  it("sends only changed fields in the update call", async () => {
    mockUpdate.mockResolvedValue({
      ...baseRepo,
      description: "New description",
      is_public: false,
    });

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    // Change description
    const descInput = screen.getByLabelText("Description");
    await user.clear(descInput);
    await user.type(descInput, "New description");

    // Toggle visibility
    const visSwitch = screen.getByLabelText("Public Access");
    await user.click(visSwitch);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("maven-releases", {
        description: "New description",
        is_public: false,
      });
    });
  });

  it("includes key in update when key is changed", async () => {
    mockUpdate.mockResolvedValue({
      ...baseRepo,
      key: "renamed-repo",
    });

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const keyInput = screen.getByLabelText("Repository Key");
    await user.clear(keyInput);
    await user.type(keyInput, "renamed-repo");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        "maven-releases",
        expect.objectContaining({ key: "renamed-repo" })
      );
    });
  });

  it("disables save button when name is empty", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);

    // Need to also make a change so the save bar appears
    const descInput = screen.getByLabelText("Description");
    await user.clear(descInput);
    await user.type(descInput, "something");

    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    expect(saveBtn).toHaveProperty("disabled", true);
  });

  it("shows visibility hint text", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByText(
        /public repositories allow unauthenticated read access/i
      )
    ).toBeTruthy();
  });
});

describe("RepoSettingsTab - Storage Section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
  });

  it("renders storage usage info", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Storage")).toBeTruthy();
    // Should show usage and quota
    expect(screen.getByText(/5\.0 GB/)).toBeTruthy();
    expect(screen.getByText(/10\.0 GB/)).toBeTruthy();
  });

  it("shows no quota message when quota_bytes is undefined", () => {
    const noQuotaRepo = { ...baseRepo, quota_bytes: undefined };
    render(<RepoSettingsTab repository={noQuotaRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText(/no quota set/)).toBeTruthy();
  });

  it("renders quota input with current value", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const quotaInput = screen.getByLabelText("Storage Quota");
    expect((quotaInput as HTMLInputElement).value).toBe("10");
  });

  it("sends quota_bytes when quota is changed", async () => {
    mockUpdate.mockResolvedValue({
      ...baseRepo,
      quota_bytes: 21474836480, // 20 GB
    });

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const quotaInput = screen.getByLabelText("Storage Quota");
    await user.clear(quotaInput);
    await user.type(quotaInput, "20");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("maven-releases", {
        quota_bytes: 21474836480,
      });
    });
  });

  it("sends update without quota_bytes when quota is cleared", async () => {
    mockUpdate.mockResolvedValue({
      ...baseRepo,
      quota_bytes: undefined,
    });

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const quotaInput = screen.getByLabelText("Storage Quota");
    await user.clear(quotaInput);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("maven-releases", {});
    });
  });

  it("shows percentage used when quota is set", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText(/50% used/)).toBeTruthy();
  });
});

describe("RepoSettingsTab - Cleanup Policies Section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no policies exist", async () => {
    mockListPolicies.mockResolvedValue([]);

    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(
        screen.getByText(/no cleanup policies configured/i)
      ).toBeTruthy();
    });
  });

  it("renders cleanup policies when they exist", async () => {
    mockListPolicies.mockResolvedValue([
      {
        id: "pol-1",
        repository_id: "repo-1",
        name: "Remove old snapshots",
        description: null,
        enabled: true,
        policy_type: "max_age_days",
        config: { max_age_days: 90 },
        priority: 1,
        last_run_at: "2024-06-15T00:00:00Z",
        last_run_items_removed: 12,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-06-15T00:00:00Z",
      },
      {
        id: "pol-2",
        repository_id: "repo-1",
        name: "Max 10 versions",
        description: null,
        enabled: false,
        policy_type: "max_versions",
        config: { max_versions: 10 },
        priority: 2,
        last_run_at: null,
        last_run_items_removed: null,
        created_at: "2024-02-01T00:00:00Z",
        updated_at: "2024-02-01T00:00:00Z",
      },
    ]);

    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("Remove old snapshots")).toBeTruthy();
    });

    expect(screen.getByText("Max 10 versions")).toBeTruthy();
    expect(screen.getByText("Max Age (Days)")).toBeTruthy();
    expect(screen.getByText("Max Versions")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(screen.getByText(/12 removed/)).toBeTruthy();
  });

  it("renders preview, execute, and delete buttons for each policy", async () => {
    mockListPolicies.mockResolvedValue([
      {
        id: "pol-1",
        repository_id: "repo-1",
        name: "Test Policy",
        description: null,
        enabled: true,
        policy_type: "max_age_days",
        config: {},
        priority: 1,
        last_run_at: null,
        last_run_items_removed: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ]);

    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("Test Policy")).toBeTruthy();
    });

    expect(
      screen.getByRole("button", { name: /preview policy test policy/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /execute policy test policy/i })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /delete policy test policy/i })
    ).toBeTruthy();
  });
});

describe("RepoSettingsTab - Repository Info Section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
  });

  it("renders read-only repository info", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Repository Info")).toBeTruthy();
    expect(screen.getByText("MAVEN")).toBeTruthy();
    expect(screen.getByText("local")).toBeTruthy();
  });

  it("shows upstream URL for remote repos", () => {
    const remoteRepo = {
      ...baseRepo,
      repo_type: "remote" as const,
      upstream_url: "https://repo.maven.apache.org/maven2",
    };

    render(<RepoSettingsTab repository={remoteRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Upstream URL")).toBeTruthy();
    expect(
      screen.getByText("https://repo.maven.apache.org/maven2")
    ).toBeTruthy();
  });

  it("does not show upstream URL for local repos", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByText("Upstream URL")).toBeNull();
  });
});

describe("RepoSettingsTab - Empty description handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
  });

  it("handles undefined description gracefully", () => {
    const repoNoDesc = { ...baseRepo, description: undefined };
    render(<RepoSettingsTab repository={repoNoDesc} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByLabelText("Description")).toHaveProperty("value", "");
  });

  it("detects changes when adding description to repo with no description", async () => {
    const repoNoDesc = { ...baseRepo, description: undefined };
    const user = userEvent.setup();

    render(<RepoSettingsTab repository={repoNoDesc} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByText("You have unsaved changes")).toBeNull();

    await user.type(
      screen.getByLabelText("Description"),
      "New description"
    );

    expect(screen.getByText("You have unsaved changes")).toBeTruthy();
  });
});

describe("RepoSettingsTab - Save error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
  });

  it("shows error toast when save fails", async () => {
    mockUpdate.mockRejectedValue(new Error("Network error"));
    const { toast } = await import("sonner");

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "New Name");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to save repository settings"
      );
    });
  });
});

describe("RepoSettingsTab - Quota unit switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
  });

  it("allows switching quota unit from GB to MB", async () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    // The quota select should show GB by default for 10 GB
    const selects = screen.getAllByTestId("mock-select");
    // Find the quota unit select (the one with MB/GB options)
    const quotaUnitSelect = selects[0]; // Only select in the component

    fireEvent.change(quotaUnitSelect, { target: { value: "MB" } });

    // Should now show unsaved changes since unit changed
    // (the actual bytes value differs because 10 GB != 10 MB)
    expect(screen.getByText("You have unsaved changes")).toBeTruthy();
  });
});
