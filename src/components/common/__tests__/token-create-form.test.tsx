// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => (
    <label {...props}>{children}</label>
  ),
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ onCheckedChange, checked, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}));
vi.mock("@/components/ui/dialog", () => ({
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => <span />,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-value={value}>{children}</div>
  ),
}));
vi.mock("@/lib/constants/token", () => ({
  SCOPES: [
    { value: "read", label: "Read" },
    { value: "write", label: "Write" },
    { value: "admin", label: "Admin" },
  ],
  EXPIRY_OPTIONS: [
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
  ],
}));
vi.mock("@/lib/api/service-accounts", () => ({}));
vi.mock("@/components/common/repo-selector-form", () => ({
  RepoSelectorForm: () => <div data-testid="repo-selector-form" />,
}));

import { TokenCreateForm } from "@/components/common/token-create-form";

function defaultProps(overrides: Partial<React.ComponentProps<typeof TokenCreateForm>> = {}) {
  return {
    title: "Create Token",
    description: "Generate a new access token",
    name: "",
    onNameChange: vi.fn(),
    expiry: "30",
    onExpiryChange: vi.fn(),
    scopes: [] as string[],
    onScopesChange: vi.fn(),
    isPending: false,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe("TokenCreateForm", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title and description", () => {
    render(
      <TokenCreateForm
        {...defaultProps({
          title: "My Token Title",
          description: "My token description",
        })}
      />
    );
    expect(screen.getByText("My Token Title")).toBeInTheDocument();
    expect(screen.getByText("My token description")).toBeInTheDocument();
  });

  it("renders name input with placeholder", () => {
    render(
      <TokenCreateForm
        {...defaultProps({ namePlaceholder: "Enter token name" })}
      />
    );
    const input = screen.getByPlaceholderText("Enter token name");
    expect(input).toBeInTheDocument();
  });

  it("renders default placeholder when namePlaceholder is not provided", () => {
    render(<TokenCreateForm {...defaultProps()} />);
    const input = screen.getByPlaceholderText("e.g., CI/CD Pipeline");
    expect(input).toBeInTheDocument();
  });

  it("renders scope checkboxes from default SCOPES", () => {
    render(<TokenCreateForm {...defaultProps()} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Write")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders scope checkboxes from custom availableScopes", () => {
    const customScopes = [
      { value: "pull", label: "Pull" },
      { value: "push", label: "Push" },
    ];
    render(
      <TokenCreateForm {...defaultProps({ availableScopes: customScopes })} />
    );
    expect(screen.getByText("Pull")).toBeInTheDocument();
    expect(screen.getByText("Push")).toBeInTheDocument();
    expect(screen.queryByText("Read")).not.toBeInTheDocument();
  });

  it("toggles scope: adds scope when not present", () => {
    const onScopesChange = vi.fn();
    render(
      <TokenCreateForm
        {...defaultProps({ scopes: ["write"], onScopesChange })}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox is "read" scope
    fireEvent.click(checkboxes[0]);
    expect(onScopesChange).toHaveBeenCalledWith(["write", "read"]);
  });

  it("toggles scope: removes scope when present", () => {
    const onScopesChange = vi.fn();
    render(
      <TokenCreateForm
        {...defaultProps({ scopes: ["read", "write"], onScopesChange })}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox is "read" scope, which is already in scopes
    fireEvent.click(checkboxes[0]);
    expect(onScopesChange).toHaveBeenCalledWith(["write"]);
  });

  it("checks the correct scope checkboxes based on scopes prop", () => {
    render(
      <TokenCreateForm {...defaultProps({ scopes: ["read", "admin"] })} />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // read (index 0) should be checked
    expect(checkboxes[0]).toBeChecked();
    // write (index 1) should not be checked
    expect(checkboxes[1]).not.toBeChecked();
    // admin (index 2) should be checked
    expect(checkboxes[2]).toBeChecked();
  });

  it("submit button is disabled when isPending is true", () => {
    render(<TokenCreateForm {...defaultProps({ isPending: true, name: "test" })} />);
    const submitButton = screen.getByText("Creating...");
    expect(submitButton).toBeDisabled();
  });

  it("submit button is disabled when name is empty", () => {
    render(<TokenCreateForm {...defaultProps({ name: "" })} />);
    const submitButton = screen.getByText("Create");
    expect(submitButton).toBeDisabled();
  });

  it("submit button is enabled when name is provided and not pending", () => {
    render(
      <TokenCreateForm
        {...defaultProps({ name: "my-token", isPending: false })}
      />
    );
    const submitButton = screen.getByText("Create");
    expect(submitButton).not.toBeDisabled();
  });

  it("shows 'Creating...' text when isPending is true", () => {
    render(
      <TokenCreateForm
        {...defaultProps({ isPending: true, name: "test" })}
      />
    );
    expect(screen.getByText("Creating...")).toBeInTheDocument();
    expect(screen.queryByText("Create")).not.toBeInTheDocument();
  });

  it("shows custom submitLabel when provided", () => {
    render(
      <TokenCreateForm
        {...defaultProps({ submitLabel: "Generate", name: "test" })}
      />
    );
    expect(screen.getByText("Generate")).toBeInTheDocument();
  });

  it("cancel button calls onCancel", () => {
    const onCancel = vi.fn();
    render(<TokenCreateForm {...defaultProps({ onCancel })} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("form submission calls onSubmit and prevents default", () => {
    const onSubmit = vi.fn();
    render(
      <TokenCreateForm {...defaultProps({ onSubmit, name: "test" })} />
    );
    const form = screen.getByText("Cancel").closest("form")!;
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("calls onNameChange when name input changes", () => {
    const onNameChange = vi.fn();
    render(<TokenCreateForm {...defaultProps({ onNameChange })} />);
    const input = screen.getByPlaceholderText("e.g., CI/CD Pipeline");
    fireEvent.change(input, { target: { value: "new-name" } });
    expect(onNameChange).toHaveBeenCalledWith("new-name");
  });

  it("shows RepoSelectorForm when showRepoSelector is true with repoSelector and onRepoSelectorChange", () => {
    const repoSelector = { match_repos: ["repo-1"] };
    const onRepoSelectorChange = vi.fn();
    render(
      <TokenCreateForm
        {...defaultProps({
          showRepoSelector: true,
          repoSelector,
          onRepoSelectorChange,
        })}
      />
    );
    expect(screen.getByTestId("repo-selector-form")).toBeInTheDocument();
    expect(screen.getByText("Repository Access")).toBeInTheDocument();
  });

  it("hides RepoSelectorForm when showRepoSelector is false", () => {
    render(<TokenCreateForm {...defaultProps({ showRepoSelector: false })} />);
    expect(screen.queryByTestId("repo-selector-form")).not.toBeInTheDocument();
  });

  it("hides RepoSelectorForm when repoSelector is undefined", () => {
    render(
      <TokenCreateForm
        {...defaultProps({
          showRepoSelector: true,
          repoSelector: undefined,
          onRepoSelectorChange: vi.fn(),
        })}
      />
    );
    expect(screen.queryByTestId("repo-selector-form")).not.toBeInTheDocument();
  });

  it("hides RepoSelectorForm when onRepoSelectorChange is undefined", () => {
    render(
      <TokenCreateForm
        {...defaultProps({
          showRepoSelector: true,
          repoSelector: { match_repos: [] },
          onRepoSelectorChange: undefined,
        })}
      />
    );
    expect(screen.queryByTestId("repo-selector-form")).not.toBeInTheDocument();
  });

  it("renders expiry options", () => {
    render(<TokenCreateForm {...defaultProps()} />);
    expect(screen.getByText("30 days")).toBeInTheDocument();
    expect(screen.getByText("90 days")).toBeInTheDocument();
  });

  it("renders the Name and Expiration labels", () => {
    render(<TokenCreateForm {...defaultProps()} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Expiration")).toBeInTheDocument();
    expect(screen.getByText("Scopes")).toBeInTheDocument();
  });

  it("renders the repo access description text when repo selector is shown", () => {
    render(
      <TokenCreateForm
        {...defaultProps({
          showRepoSelector: true,
          repoSelector: { match_repos: [] },
          onRepoSelectorChange: vi.fn(),
        })}
      />
    );
    expect(
      screen.getByText(/Restrict which repositories this token can access/)
    ).toBeInTheDocument();
  });
});
