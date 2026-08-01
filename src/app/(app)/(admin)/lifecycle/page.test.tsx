// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

interface MutationConfig {
  mutationFn: (...args: unknown[]) => unknown;
}

const mutationConfigs: MutationConfig[] = [];
const mutateFns: Array<ReturnType<typeof vi.fn>> = [];
const { lifecycleApi, repositoriesApi } = vi.hoisted(() => ({
  lifecycleApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    preview: vi.fn(),
    executeAll: vi.fn(),
  },
  repositoriesApi: { list: vi.fn() },
}));
let policiesQuery = { data: [], isLoading: false };
let repositoriesQuery: {
  data: { items: Array<Record<string, string>> } | undefined;
  isLoading: boolean;
  isError?: boolean;
} = {
  data: {
    items: [
      {
        id: "repo-npm-local",
        key: "npm-local",
        format: "npm",
        repo_type: "local",
      },
      {
        id: "repo-docker-local",
        key: "docker-local",
        format: "docker",
        repo_type: "local",
      },
    ],
  },
  isLoading: false,
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: {
    queryKey: string[];
    queryFn: () => unknown;
    enabled?: boolean;
  }) => {
    if (options.enabled !== false) {
      try {
        options.queryFn();
      } catch {
        // Query errors are represented by the controlled test response.
      }
    }

    return options.queryKey[0] === "repositories"
      ? repositoriesQuery
      : { ...policiesQuery, isError: false };
  },
  useMutation: (config: MutationConfig) => {
    mutationConfigs.push(config);
    const mutate = vi.fn();
    mutateFns.push(mutate);
    return { mutate, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api/lifecycle", () => ({ lifecycleApi: lifecycleApi }));

vi.mock("@/lib/api/repositories", () => ({ repositoriesApi }));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: { is_admin: true } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => {
    let id = "";
    const items: Array<{ value: string; label: string }> = [];

    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const childProps = child.props as {
        id?: string;
        children?: React.ReactNode;
      };
      if (childProps.id) id = childProps.id;
      React.Children.forEach(childProps.children, (item) => {
        if (!React.isValidElement(item)) return;
        const itemProps = item.props as {
          value?: string;
          children?: React.ReactNode;
        };
        if (itemProps.value) {
          items.push({
            value: itemProps.value,
            label: String(itemProps.children),
          });
        }
      });
    });

    return (
      <select
        aria-label={id === "lifecycle-type" ? "Policy Type" : "Repository"}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        <option value="">Select</option>
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children, ...props }: { children: React.ReactNode }) => (
    <span {...props}>{children}</span>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({
    value,
    onValueChange,
    ...props
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <input
      {...props}
      value={value ?? ""}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));

import LifecyclePage from "./page";

// The component declares mutations in this fixed order: create, delete,
// toggle, execute, preview, execute-all. State changes produce a new set.
const createMutate = () => mutateFns[mutateFns.length - 6];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  policiesQuery = { data: [], isLoading: false };
  repositoriesQuery = {
    data: {
      items: [
        {
          id: "repo-npm-local",
          key: "npm-local",
          format: "npm",
          repo_type: "local",
        },
        {
          id: "repo-docker-local",
          key: "docker-local",
          format: "docker",
          repo_type: "local",
        },
      ],
    },
    isLoading: false,
  };
});

afterEach(() => cleanup());

describe("LifecyclePage repository scope", () => {
  it("keeps globally applicable policies global", async () => {
    const user = userEvent.setup();
    render(<LifecyclePage />);

    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.type(screen.getByLabelText("Name"), "Remove stale artifacts");

    expect(screen.queryByLabelText("Repository")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createMutate()).toHaveBeenCalledWith({
      name: "Remove stale artifacts",
      description: undefined,
      policy_type: "max_age_days",
      config: { days: 90 },
      repository_id: undefined,
    });
  });

  it("requires a repository and sends its ID for Max Versions", async () => {
    const user = userEvent.setup();
    render(<LifecyclePage />);

    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.type(screen.getByLabelText("Name"), "Keep recent npm releases");
    await user.selectOptions(screen.getByLabelText("Policy Type"), "max_versions");

    expect(screen.getByText(/required for max versions and size quota/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled();
    expect(repositoriesApi.list).toHaveBeenCalledWith({ per_page: 1000 });

    await user.click(screen.getByRole("combobox", { name: "Repository" }));
    await user.type(screen.getByRole("textbox", { name: "Search repositories" }), "docker");
    expect(screen.queryByRole("button", { name: /npm-local/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /docker-local/i }));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createMutate()).toHaveBeenCalledWith({
      name: "Keep recent npm releases",
      description: undefined,
      policy_type: "max_versions",
      config: { keep: 5 },
      repository_id: "repo-docker-local",
    });
  });

  it("requires the same repository selection for Size Quota", async () => {
    const user = userEvent.setup();
    render(<LifecyclePage />);

    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.selectOptions(
      screen.getByLabelText("Policy Type"),
      "size_quota_bytes"
    );

    expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled();
  });

  it("clears repository scope when switching back to a global policy", async () => {
    const user = userEvent.setup();
    render(<LifecyclePage />);

    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.type(screen.getByLabelText("Name"), "Remove stale artifacts");
    await user.selectOptions(screen.getByLabelText("Policy Type"), "max_versions");
    await user.click(screen.getByRole("button", { name: /docker-local/i }));
    await user.selectOptions(screen.getByLabelText("Policy Type"), "max_age_days");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createMutate()).toHaveBeenCalledWith({
      name: "Remove stale artifacts",
      description: undefined,
      policy_type: "max_age_days",
      config: { days: 90 },
      repository_id: undefined,
    });
  });

  it("clears repository search when the create dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(<LifecyclePage />);

    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.selectOptions(screen.getByLabelText("Policy Type"), "max_versions");
    await user.type(
      screen.getByRole("textbox", { name: "Search repositories" }),
      "docker"
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /new policy/i }));

    expect(
      screen.getByRole("textbox", { name: "Search repositories" })
    ).toHaveValue("");
  });

  it("shows an error when repositories cannot be loaded", async () => {
    const user = userEvent.setup();
    repositoriesQuery = { data: undefined, isLoading: false, isError: true };
    render(<LifecyclePage />);

    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.selectOptions(screen.getByLabelText("Policy Type"), "max_versions");

    expect(screen.getByText(/couldn't load repositories/i)).toBeInTheDocument();
  });

  it("shows an empty state when no repositories are available", async () => {
    const user = userEvent.setup();
    repositoriesQuery = { data: { items: [] }, isLoading: false };
    render(<LifecyclePage />);

    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.selectOptions(screen.getByLabelText("Policy Type"), "max_versions");

    expect(screen.getByText("No repositories are available.")).toBeInTheDocument();
  });
});
