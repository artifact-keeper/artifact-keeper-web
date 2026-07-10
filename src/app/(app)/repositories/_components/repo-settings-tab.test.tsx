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
const mockUpdateAgePolicy = vi.fn();
const mockGetCacheTtl = vi.fn();
const mockSetCacheTtl = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    update: (...args: unknown[]) => mockUpdate(...args),
    updateAgePolicy: (...args: unknown[]) => mockUpdateAgePolicy(...args),
    getCacheTtl: (...args: unknown[]) => mockGetCacheTtl(...args),
    setCacheTtl: (...args: unknown[]) => mockSetCacheTtl(...args),
  },
}));

// Mock the shared admin-settings hook (used for the read-only upload limit, #189)
const mockUseAdminSettings = vi.fn();
vi.mock("@/hooks/use-admin-settings", () => ({
  useAdminSettings: () => mockUseAdminSettings(),
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
vi.mock("@/lib/error-utils", async () => {
  const { toast } = await import("sonner");
  return {
    toUserMessage: (_err: unknown, fallback: string) => fallback,
    mutationErrorToast: (label: string) => () => {
      toast.error(label);
    },
  };
});

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

// Default admin-settings return: upload limit available. Individual tests can
// override. clearAllMocks() preserves this implementation (it only clears
// call history), so it survives the per-describe beforeEach hooks.
mockUseAdminSettings.mockReturnValue({
  data: {
    storageSettings: {
      storage_backend: "filesystem",
      storage_path: "/data",
      max_upload_size_bytes: 1073741824,
    },
  },
});

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

import { ageToMinutes } from "./repo-settings-tab";

describe("ageToMinutes helper", () => {
  it("converts days to minutes", () => {
    expect(ageToMinutes("3", "days")).toBe(4320);
  });

  it("converts hours to minutes", () => {
    expect(ageToMinutes("12", "hours")).toBe(720);
  });

  it("returns 0 for empty, zero, or negative input", () => {
    expect(ageToMinutes("", "days")).toBe(0);
    expect(ageToMinutes("0", "hours")).toBe(0);
    expect(ageToMinutes("-5", "days")).toBe(0);
  });

  it("rounds fractional values to whole minutes", () => {
    expect(ageToMinutes("1.5", "hours")).toBe(90);
  });
});

describe("RepoSettingsTab - Package Age Policy (#265)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
  });

  it("renders the age policy section with an enable toggle", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Package Age Policy")).toBeTruthy();
    expect(screen.getByLabelText("Enable age policy")).toBeTruthy();
  });

  it("keeps the cooldown input disabled until the policy is enabled", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const duration = screen.getByLabelText("Cooldown period") as HTMLInputElement;
    expect(duration.disabled).toBe(true);
  });

  it("saves the age policy with the configured duration in minutes", async () => {
    mockUpdateAgePolicy.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByLabelText("Enable age policy"));

    const duration = screen.getByLabelText("Cooldown period");
    await user.clear(duration);
    await user.type(duration, "7");

    await user.click(screen.getByRole("button", { name: /save age policy/i }));

    await waitFor(() => {
      expect(mockUpdateAgePolicy).toHaveBeenCalledWith("maven-releases", {
        enabled: true,
        duration_minutes: 10080,
      });
    });
  });

  it("disables save and shows an error when the duration is invalid", async () => {
    const user = userEvent.setup();

    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByLabelText("Enable age policy"));

    const duration = screen.getByLabelText("Cooldown period");
    await user.clear(duration);

    const saveBtn = screen.getByRole("button", { name: /save age policy/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    expect(mockUpdateAgePolicy).not.toHaveBeenCalled();
  });
});

describe("RepoSettingsTab - Upload size limit display (#189)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
    mockUseAdminSettings.mockReturnValue({
      data: {
        storageSettings: {
          storage_backend: "filesystem",
          storage_path: "/data",
          max_upload_size_bytes: 1073741824,
        },
      },
    });
  });

  it("shows the effective upload size limit read-only", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const limit = screen.getByLabelText("Upload size limit") as HTMLInputElement;
    expect(limit.value).toBe("1.0 GB");
    expect(limit.disabled).toBe(true);
  });

  it("shows 'No limit' when the configured limit is zero", () => {
    mockUseAdminSettings.mockReturnValue({
      data: {
        storageSettings: {
          storage_backend: "filesystem",
          storage_path: "/data",
          max_upload_size_bytes: 0,
        },
      },
    });

    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    const limit = screen.getByLabelText("Upload size limit") as HTMLInputElement;
    expect(limit.value).toBe("No limit");
  });
});

// ---------------------------------------------------------------------------
// Proxy Cache section (#448) -- shown only for Remote (proxy) repos. Pin
// the visibility gate, the editing flow that plugs into the existing
// hasChanges / Save / Discard workflow, and the inline-validation that
// mirrors the backend's validate_cache_ttl range (1..=2_592_000).
// ---------------------------------------------------------------------------

const remoteRepo: Repository = {
  ...baseRepo,
  id: "repo-2",
  key: "pypi-remote",
  name: "PyPI Remote",
  repo_type: "remote",
  upstream_url: "https://pypi.org",
};

describe("RepoSettingsTab - Proxy Cache section (#448)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
    // Default to a stable success response so the Proxy Cache section
    // can render its initial value -- per-test overrides via
    // .mockResolvedValueOnce / .mockRejectedValueOnce.
    mockGetCacheTtl.mockResolvedValue({
      repository_key: "pypi-remote",
      cache_ttl_seconds: 86400,
    });
  });

  it("hides the Proxy Cache section for Local repos", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });
    expect(screen.queryByText("Proxy Cache")).toBeNull();
    expect(screen.queryByLabelText("Cache TTL (seconds)")).toBeNull();
    // No GET should be issued for non-Remote repos -- the useQuery is
    // gated on `enabled: isRemote` to avoid wasted round-trips.
    expect(mockGetCacheTtl).not.toHaveBeenCalled();
  });

  it("hides the Proxy Cache section for Virtual / Staging repos", () => {
    const virtualRepo: Repository = { ...baseRepo, repo_type: "virtual" };
    render(<RepoSettingsTab repository={virtualRepo} />, {
      wrapper: createWrapper(),
    });
    expect(screen.queryByText("Proxy Cache")).toBeNull();
    expect(mockGetCacheTtl).not.toHaveBeenCalled();
  });

  it("renders the Proxy Cache section with the TTL fetched from the backend on Remote repos", async () => {
    render(<RepoSettingsTab repository={remoteRepo} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText("Proxy Cache")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText("Cache TTL (seconds)")).toHaveProperty(
        "value",
        "86400"
      );
    });
    expect(mockGetCacheTtl).toHaveBeenCalledWith("pypi-remote");
    // The human-readable hint should display alongside the input -- 86400s
    // is the backend's default fallback (artifact-keeper#917) and the
    // helper picks the largest unit that gives an integer magnitude, so
    // "1 day" rather than "24 hours".
    expect(screen.getByText(/1 day/)).toBeTruthy();
  });

  it("triggers the unsaved-changes bar when the TTL is edited", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={remoteRepo} />, {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Cache TTL (seconds)")).toHaveProperty(
        "value",
        "86400"
      );
    });

    const input = screen.getByLabelText("Cache TTL (seconds)");
    await user.clear(input);
    await user.type(input, "3600");

    expect(screen.getByText("You have unsaved changes")).toBeTruthy();
  });

  it("calls setCacheTtl on save and shows a success toast", async () => {
    mockSetCacheTtl.mockResolvedValue({
      repository_key: "pypi-remote",
      cache_ttl_seconds: 3600,
    });
    const { toast } = await import("sonner");

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={remoteRepo} />, {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Cache TTL (seconds)")).toHaveProperty(
        "value",
        "86400"
      );
    });

    const input = screen.getByLabelText("Cache TTL (seconds)");
    await user.clear(input);
    await user.type(input, "3600");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockSetCacheTtl).toHaveBeenCalledWith("pypi-remote", 3600);
    });
    expect(toast.success).toHaveBeenCalledWith("Cache TTL saved");
    // The general-fields update mutation must NOT fire when only the
    // TTL changed -- the two endpoints are independent and we don't want
    // to send an empty PATCH that the audit log would record as a no-op
    // edit.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("shows the inline error and disables Save for out-of-range TTL", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={remoteRepo} />, {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Cache TTL (seconds)")).toHaveProperty(
        "value",
        "86400"
      );
    });

    const input = screen.getByLabelText("Cache TTL (seconds)");
    await user.clear(input);
    // Above the backend max of 2,592,000 (30 days).
    await user.type(input, "9999999");

    expect(
      screen.getByText(
        /Must be a whole number between 1 and 2,592,000/i
      )
    ).toBeTruthy();
    expect(input).toHaveProperty("ariaInvalid", "true");
    const save = screen.getByRole("button", { name: /save changes/i });
    expect(save).toHaveProperty("disabled", true);
  });

  it("zero is rejected as out-of-range (backend min is 1)", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={remoteRepo} />, {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Cache TTL (seconds)")).toHaveProperty(
        "value",
        "86400"
      );
    });

    const input = screen.getByLabelText("Cache TTL (seconds)");
    await user.clear(input);
    await user.type(input, "0");

    expect(
      screen.getByText(
        /Must be a whole number between 1 and 2,592,000/i
      )
    ).toBeTruthy();
  });

  it("Discard reverts the TTL override back to the fetched value", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={remoteRepo} />, {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Cache TTL (seconds)")).toHaveProperty(
        "value",
        "86400"
      );
    });

    const input = screen.getByLabelText("Cache TTL (seconds)");
    await user.clear(input);
    await user.type(input, "3600");
    expect(screen.getByText("You have unsaved changes")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.queryByText("You have unsaved changes")).toBeNull();
    expect(input).toHaveProperty("value", "86400");
  });

  it("shows an error toast when setCacheTtl fails (e.g. 503 from a misconfigured proxy)", async () => {
    mockSetCacheTtl.mockRejectedValue(
      new Error("proxy service not configured")
    );
    const { toast } = await import("sonner");

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={remoteRepo} />, {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Cache TTL (seconds)")).toHaveProperty(
        "value",
        "86400"
      );
    });

    const input = screen.getByLabelText("Cache TTL (seconds)");
    await user.clear(input);
    await user.type(input, "3600");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to save cache TTL");
    });
  });
});

describe("RepoSettingsTab - Artifact Versioning Section (#571)", () => {
  const genericRepo: Repository = {
    ...baseRepo,
    id: "repo-generic",
    key: "configs",
    name: "Configs",
    format: "generic",
    versioning_enabled: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListPolicies.mockResolvedValue([]);
  });

  it("renders the section with the switch off for a generic repo without versioning", () => {
    render(<RepoSettingsTab repository={genericRepo} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByRole("heading", { name: /artifact versioning/i })
    ).toBeTruthy();
    const toggle = screen.getByLabelText("Enable versioning");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("seeds the switch from repository.versioning_enabled", () => {
    render(
      <RepoSettingsTab
        repository={{ ...genericRepo, versioning_enabled: true }}
      />,
      { wrapper: createWrapper() }
    );

    expect(
      screen.getByLabelText("Enable versioning").getAttribute("aria-checked")
    ).toBe("true");
  });

  it("does not render the section for formats without first-class versioning", () => {
    render(<RepoSettingsTab repository={baseRepo} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.queryByRole("heading", { name: /artifact versioning/i })
    ).toBeNull();
    expect(screen.queryByLabelText("Enable versioning")).toBeNull();
  });

  it("renders the section for mlmodel repositories", () => {
    render(
      <RepoSettingsTab repository={{ ...genericRepo, format: "mlmodel" }} />,
      { wrapper: createWrapper() }
    );

    expect(
      screen.getByRole("heading", { name: /artifact versioning/i })
    ).toBeTruthy();
  });

  it("saves versioning_enabled through the repository update endpoint", async () => {
    mockUpdate.mockResolvedValue({ ...genericRepo, versioning_enabled: true });

    const user = userEvent.setup();
    render(<RepoSettingsTab repository={genericRepo} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByLabelText("Enable versioning"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("configs", {
        versioning_enabled: true,
      });
    });
  });

  it("can disable versioning on a repo where it is on", async () => {
    mockUpdate.mockResolvedValue({ ...genericRepo, versioning_enabled: false });

    const user = userEvent.setup();
    render(
      <RepoSettingsTab
        repository={{ ...genericRepo, versioning_enabled: true }}
      />,
      { wrapper: createWrapper() }
    );

    await user.click(screen.getByLabelText("Enable versioning"));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("configs", {
        versioning_enabled: false,
      });
    });
  });

  it("discard resets a toggled versioning switch without saving", async () => {
    const user = userEvent.setup();
    render(<RepoSettingsTab repository={genericRepo} />, {
      wrapper: createWrapper(),
    });

    await user.click(screen.getByLabelText("Enable versioning"));
    expect(screen.getByText(/unsaved changes/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /discard/i }));

    expect(screen.queryByText(/unsaved changes/i)).toBeNull();
    expect(
      screen.getByLabelText("Enable versioning").getAttribute("aria-checked")
    ).toBe("false");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
