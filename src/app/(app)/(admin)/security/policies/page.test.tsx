// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
  (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
});

afterEach(() => cleanup());

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/error-utils", () => ({
  mutationErrorToast: () => () => {},
}));

const mockListPolicies = vi.fn();
const mockCreatePolicy = vi.fn();
const mockUpdatePolicy = vi.fn();
const mockDeletePolicy = vi.fn();
vi.mock("@/lib/api/security", () => ({
  default: {
    listPolicies: (...a: unknown[]) => mockListPolicies(...a),
    createPolicy: (...a: unknown[]) => mockCreatePolicy(...a),
    updatePolicy: (...a: unknown[]) => mockUpdatePolicy(...a),
    deletePolicy: (...a: unknown[]) => mockDeletePolicy(...a),
  },
}));

const mockRepoList = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: { list: (...a: unknown[]) => mockRepoList(...a) },
}));

// Native-select stub so options are in the DOM and selection is deterministic
// (this admin-page directory's convention; Radix Select is finicky in jsdom).
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
    const items: Array<{ value: string; label: string }> = [];
    React.Children.forEach(children, (c) => {
      if (!React.isValidElement(c)) return;
      React.Children.forEach((c as React.ReactElement<{ children?: React.ReactNode }>).props.children, (s) => {
        if (React.isValidElement(s) && (s.props as Record<string, unknown>).value) {
          const p = s.props as { value: string; children: React.ReactNode };
          // Join multi-node children ("{name} ({key})") without comma noise.
          items.push({ value: p.value, label: React.Children.toArray(p.children).join("") });
        }
      });
    });
    return (
      <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>
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

import SecurityPoliciesPage from "./page";

const REPO = {
  id: "rel-1",
  key: "maven-release",
  name: "Maven Release",
  format: "maven",
  repo_type: "local",
  is_public: true,
  storage_used_bytes: 0,
  created_at: "2025-01-01",
  updated_at: "2025-01-01",
};

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Block criticals",
    max_severity: "high",
    block_unscanned: false,
    block_on_fail: false,
    is_enabled: true,
    repository_id: null,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SecurityPoliciesPage />
    </QueryClientProvider>
  );
}

// Locate the repository <select> by the Global option it uniquely contains.
function repoSelect() {
  return screen.getByRole("option", { name: "Global (all repositories)" }).closest("select") as HTMLSelectElement;
}

describe("SecurityPoliciesPage repository scope (#489)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepoList.mockResolvedValue({
      items: [REPO],
      pagination: { page: 1, per_page: 200, total: 1, total_pages: 1 },
    });
    mockCreatePolicy.mockResolvedValue({});
  });

  it("resolves a scoped policy's repository_id to name + key in the list", async () => {
    mockListPolicies.mockResolvedValue([policy({ repository_id: "rel-1" })]);
    renderPage();
    // Not the truncated UUID.
    expect(await screen.findByText("Maven Release (maven-release)")).toBeInTheDocument();
    expect(screen.queryByText(/Repo: rel-1/)).not.toBeInTheDocument();
  });

  it("offers a repository Select (not a free-text UUID field) in the create form", async () => {
    mockListPolicies.mockResolvedValue([]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /create policy/i }));

    // Old free-text input is gone; the picker lists Global + repos (repos load async).
    expect(screen.queryByPlaceholderText(/leave blank for a global policy/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Global (all repositories)" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Maven Release (maven-release)" })).toBeInTheDocument();
  });

  it("submits the chosen repository UUID, and null for Global", async () => {
    mockListPolicies.mockResolvedValue([]);
    renderPage();

    // --- scoped ---
    fireEvent.click(screen.getByRole("button", { name: /create policy/i }));
    let dialog = screen.getByRole("dialog");
    await within(dialog).findByRole("option", { name: "Maven Release (maven-release)" });
    fireEvent.change(within(dialog).getByLabelText("Policy Name"), { target: { value: "Scoped" } });
    fireEvent.change(repoSelect(), { target: { value: "rel-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create policy/i }));
    await waitFor(() =>
      expect(mockCreatePolicy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Scoped", repository_id: "rel-1" })
      )
    );

    // --- global (default selection) ---
    mockCreatePolicy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /create policy/i }));
    dialog = screen.getByRole("dialog");
    await within(dialog).findByLabelText("Policy Name");
    fireEvent.change(within(dialog).getByLabelText("Policy Name"), { target: { value: "GlobalOne" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create policy/i }));
    await waitFor(() =>
      expect(mockCreatePolicy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "GlobalOne", repository_id: null })
      )
    );
  });
});
