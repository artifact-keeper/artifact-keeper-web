// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => ({
  Search: () => null,
  Plus: () => null,
  X: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ onCheckedChange, checked }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onCheckedChange?.(!checked)}
    />
  ),
}));

const mockMutate = vi.fn();
let capturedMutationOpts: any = null;
vi.mock("@tanstack/react-query", () => ({
  useMutation: (opts: any) => {
    capturedMutationOpts = opts;
    return { mutate: mockMutate, isPending: false };
  },
}));

const mockPreviewRepoSelector = vi.fn();
vi.mock("@/lib/api/service-accounts", () => ({
  serviceAccountsApi: {
    previewRepoSelector: (...args: any[]) => mockPreviewRepoSelector(...args),
  },
}));

// ---------------------------------------------------------------------------
// Component under test (imported AFTER all vi.mock calls)
// ---------------------------------------------------------------------------

import { RepoSelectorForm } from "../repo-selector-form";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMMON_FORMATS = [
  "docker",
  "maven",
  "npm",
  "pypi",
  "cargo",
  "helm",
  "nuget",
  "go",
  "rubygems",
  "debian",
  "rpm",
  "generic",
];

function renderForm(
  valueOverride: Partial<{
    match_formats: string[];
    match_labels: Record<string, string>;
    match_pattern: string;
  }> = {},
  onChangeFn?: ReturnType<typeof vi.fn>
) {
  const onChange = (onChangeFn ?? vi.fn()) as (selector: any) => void;
  const value = {
    match_formats: undefined as string[] | undefined,
    match_labels: undefined as Record<string, string> | undefined,
    match_pattern: undefined as string | undefined,
    ...valueOverride,
  };
  render(<RepoSelectorForm value={value} onChange={onChange} />);
  return { onChange, value };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RepoSelectorForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMutationOpts = null;
  });

  afterEach(() => {
    cleanup();
  });

  // 1. Renders all 12 format checkboxes
  it("renders all 12 format checkboxes", () => {
    renderForm();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(COMMON_FORMATS.length);

    for (const fmt of COMMON_FORMATS) {
      expect(screen.getByText(fmt)).toBeDefined();
    }
  });

  // 2. toggleFormat adds format when unchecked
  it("adds a format when its checkbox is toggled on", () => {
    const { onChange } = renderForm();

    const checkboxes = screen.getAllByRole("checkbox");
    // Click the first checkbox (docker)
    fireEvent.click(checkboxes[0]);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ match_formats: ["docker"] })
    );
  });

  // 3. toggleFormat removes format when checked, sets undefined when empty
  it("removes a format when its checkbox is toggled off, and sets match_formats to undefined when empty", () => {
    const { onChange } = renderForm({ match_formats: ["docker"] });

    const checkboxes = screen.getAllByRole("checkbox");
    // The first checkbox (docker) should be checked; click to uncheck
    fireEvent.click(checkboxes[0]);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ match_formats: undefined })
    );
  });

  // Extra: toggling off one format when multiple are selected keeps remaining
  it("keeps remaining formats when one is toggled off from multiple", () => {
    const { onChange } = renderForm({ match_formats: ["docker", "maven"] });

    const checkboxes = screen.getAllByRole("checkbox");
    // Click docker (index 0) to remove it
    fireEvent.click(checkboxes[0]);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ match_formats: ["maven"] })
    );
  });

  // 4. Renders name pattern input
  it("renders the name pattern input", () => {
    renderForm({ match_pattern: "libs-*" });

    const input = screen.getByPlaceholderText("libs-*");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).value).toBe("libs-*");
  });

  // 5. setPattern updates value and sets undefined for empty string
  it("updates match_pattern when pattern input changes", () => {
    const { onChange } = renderForm();

    const input = screen.getByPlaceholderText("libs-*");
    fireEvent.change(input, { target: { value: "prod-*" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ match_pattern: "prod-*" })
    );
  });

  it("sets match_pattern to undefined when pattern is cleared", () => {
    const { onChange } = renderForm({ match_pattern: "something" });

    const input = screen.getByPlaceholderText("libs-*");
    fireEvent.change(input, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ match_pattern: undefined })
    );
  });

  // 6. addLabel adds key-value pair and clears inputs
  it("adds a label when the Add button is clicked", () => {
    const { onChange } = renderForm();

    const keyInput = screen.getByPlaceholderText("key (e.g., env)");
    const valueInput = screen.getByPlaceholderText("value (e.g., production)");

    fireEvent.change(keyInput, { target: { value: "env" } });
    fireEvent.change(valueInput, { target: { value: "production" } });

    // Find the Add button (it's the one with the Plus icon, which is disabled
    // state depends on key/value). We need to get all buttons and find the add one.
    // The Add button contains the Plus icon (rendered as null) and is the first
    // button of type="button" with size="icon".
    const buttons = screen.getAllByRole("button");
    // The Add button has the Plus icon child. Since Plus renders null, we look
    // for the button that is NOT the Preview button.
    // The Add button is the one that is not disabled when key/value are filled.
    // Since we've set key and value, let's just find the non-disabled small button.
    // Actually the component re-renders with internal state, but since mocked
    // useMutation and no actual React state update in the mock... Let's click
    // based on position. The Add button is before the Preview button.
    // Buttons in order: format label buttons (none since no labels), Add button, Preview button
    // Plus renders null so Add button has no text. We can find it by checking.

    // There's also the Preview button with text "Preview Matched Repos"
    const previewButton = screen.getByText("Preview Matched Repos");
    const addButton = buttons.find((b) => b !== previewButton.closest("button") && b !== previewButton);
    expect(addButton).toBeDefined();
    fireEvent.click(addButton!);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        match_labels: { env: "production" },
      })
    );
  });

  // 7. addLabel does nothing when key or value is empty
  it("does not add a label when key is empty", () => {
    renderForm();

    const valueInput = screen.getByPlaceholderText("value (e.g., production)");
    fireEvent.change(valueInput, { target: { value: "production" } });

    // The Add button should be disabled, but let's also verify addLabel guards
    const buttons = screen.getAllByRole("button");
    const previewButton = screen.getByText("Preview Matched Repos");
    const addButton = buttons.find((b) => b !== previewButton.closest("button") && b !== previewButton);
    // Button should be disabled
    expect(addButton?.hasAttribute("disabled")).toBe(true);
  });

  it("does not add a label when value is empty", () => {
    renderForm();

    const keyInput = screen.getByPlaceholderText("key (e.g., env)");
    fireEvent.change(keyInput, { target: { value: "env" } });

    const buttons = screen.getAllByRole("button");
    const previewButton = screen.getByText("Preview Matched Repos");
    const addButton = buttons.find((b) => b !== previewButton.closest("button") && b !== previewButton);
    expect(addButton?.hasAttribute("disabled")).toBe(true);
  });

  // 8. removeLabel removes a label and sets match_labels to undefined when empty
  it("removes a label when its remove button is clicked", () => {
    const { onChange } = renderForm({
      match_labels: { env: "production", team: "backend" },
    });

    // Labels are rendered as Badge with text "key=value" and a button inside
    expect(screen.getByText(/env=production/)).toBeDefined();
    expect(screen.getByText(/team=backend/)).toBeDefined();

    // Find remove buttons inside badges. The X icon renders null so the button
    // inside the badge only has the X icon (null). We look for type="button"
    // buttons inside spans (Badge mock).
    // Click the remove button inside the first badge (env=production)
    const envBadge = screen.getByText(/env=production/);
    const removeBtn = envBadge.querySelector("button");
    expect(removeBtn).toBeDefined();
    fireEvent.click(removeBtn!);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        match_labels: { team: "backend" },
      })
    );
  });

  it("sets match_labels to undefined when the last label is removed", () => {
    const { onChange } = renderForm({
      match_labels: { env: "production" },
    });

    const badge = screen.getByText(/env=production/);
    const removeBtn = badge.querySelector("button");
    fireEvent.click(removeBtn!);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ match_labels: undefined })
    );
  });

  // 9. Existing labels are displayed
  it("displays existing labels as badges", () => {
    renderForm({
      match_labels: { env: "staging", region: "us-east-1" },
    });

    expect(screen.getByText(/env=staging/)).toBeDefined();
    expect(screen.getByText(/region=us-east-1/)).toBeDefined();
  });

  // 10. Preview button is disabled when no filters
  it("disables the Preview button when no filters are set", () => {
    renderForm();

    const previewButton = screen.getByText("Preview Matched Repos").closest("button")!;
    expect(previewButton.disabled).toBe(true);
  });

  // 11. Preview button triggers mutation
  it("triggers the mutation when Preview button is clicked with filters", () => {
    const value = { match_formats: ["docker"] as string[] };
    const onChange = vi.fn();
    render(<RepoSelectorForm value={value} onChange={onChange} />);

    const previewButton = screen.getByText("Preview Matched Repos").closest("button")!;
    expect(previewButton.disabled).toBe(false);

    fireEvent.click(previewButton);

    expect(mockMutate).toHaveBeenCalledWith(value);
  });

  // 12. Preview results display matched repositories with count (plural)
  it("displays preview results with plural repository count", () => {
    const onChange = vi.fn();
    const value = { match_formats: ["docker"] as string[] };

    // We need to simulate the onSuccess callback being called.
    // Render the component to capture the mutation opts, then call onSuccess.
    render(
      <RepoSelectorForm value={value} onChange={onChange} />
    );

    expect(capturedMutationOpts).toBeDefined();

    // Simulate onSuccess with multiple results
    const mockResults = [
      { id: "1", key: "libs-release", format: "docker" },
      { id: "2", key: "libs-snapshot", format: "maven" },
    ];

    // We need to trigger a re-render with the preview results.
    // The onSuccess callback calls setPreviewResults. Since this is React state,
    // we need to call it in an act-like way. Let's use React's act.
    act(() => {
      capturedMutationOpts.onSuccess({ matched_repositories: mockResults });
    });

    expect(screen.getByText("2 repositories matched")).toBeDefined();
    // "docker" and "maven" also appear as checkbox labels, so use getAllByText
    expect(screen.getAllByText("docker").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("libs-release")).toBeDefined();
    expect(screen.getAllByText("maven").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("libs-snapshot")).toBeDefined();
  });

  // 13. Preview shows singular "repository" for count of 1
  it("displays singular 'repository' when exactly one result matches", () => {
    const onChange = vi.fn();
    const value = { match_formats: ["npm"] as string[] };
    render(<RepoSelectorForm value={value} onChange={onChange} />);

    act(() => {
      capturedMutationOpts.onSuccess({
        matched_repositories: [{ id: "1", key: "npm-local", format: "npm" }],
      });
    });

    expect(screen.getByText("1 repository matched")).toBeDefined();
  });

  // Extra: zero results
  it("displays '0 repositories matched' when no results match", () => {
    const onChange = vi.fn();
    const value = { match_pattern: "nonexistent-*" };
    render(<RepoSelectorForm value={value} onChange={onChange} />);

    act(() => {
      capturedMutationOpts.onSuccess({ matched_repositories: [] });
    });

    expect(screen.getByText("0 repositories matched")).toBeDefined();
  });

  // 14. Enter key in label value input triggers addLabel
  it("triggers addLabel when Enter is pressed in the label value input", () => {
    const { onChange } = renderForm();

    const keyInput = screen.getByPlaceholderText("key (e.g., env)");
    const valueInput = screen.getByPlaceholderText("value (e.g., production)");

    fireEvent.change(keyInput, { target: { value: "tier" } });
    fireEvent.change(valueInput, { target: { value: "premium" } });
    fireEvent.keyDown(valueInput, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        match_labels: { tier: "premium" },
      })
    );
  });

  it("does not trigger addLabel on non-Enter key press in value input", () => {
    const { onChange } = renderForm();

    const keyInput = screen.getByPlaceholderText("key (e.g., env)");
    const valueInput = screen.getByPlaceholderText("value (e.g., production)");

    fireEvent.change(keyInput, { target: { value: "tier" } });
    fireEvent.change(valueInput, { target: { value: "premium" } });
    fireEvent.keyDown(valueInput, { key: "Tab" });

    expect(onChange).not.toHaveBeenCalled();
  });

  // 15. All actions clear preview results
  it("clears preview results when a format is toggled", () => {
    const onChange = vi.fn();
    const value = { match_formats: ["docker"] as string[] };
    render(<RepoSelectorForm value={value} onChange={onChange} />);

    // First, set preview results via onSuccess
    act(() => {
      capturedMutationOpts.onSuccess({
        matched_repositories: [{ id: "1", key: "test", format: "docker" }],
      });
    });
    expect(screen.getByText("1 repository matched")).toBeDefined();

    // Toggle a format checkbox (maven, index 1)
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    // Preview results should be cleared
    expect(screen.queryByText("1 repository matched")).toBeNull();
  });

  it("clears preview results when the pattern is changed", () => {
    const onChange = vi.fn();
    const value = { match_pattern: "test-*" };
    render(<RepoSelectorForm value={value} onChange={onChange} />);

    act(() => {
      capturedMutationOpts.onSuccess({
        matched_repositories: [{ id: "1", key: "test-repo", format: "npm" }],
      });
    });
    expect(screen.getByText("1 repository matched")).toBeDefined();

    const patternInput = screen.getByPlaceholderText("libs-*");
    fireEvent.change(patternInput, { target: { value: "prod-*" } });

    expect(screen.queryByText("1 repository matched")).toBeNull();
  });

  it("clears preview results when a label is removed", () => {
    const onChange = vi.fn();
    const value = { match_labels: { env: "prod" } };
    render(<RepoSelectorForm value={value} onChange={onChange} />);

    act(() => {
      capturedMutationOpts.onSuccess({
        matched_repositories: [{ id: "1", key: "repo", format: "docker" }],
      });
    });
    expect(screen.getByText("1 repository matched")).toBeDefined();

    const badge = screen.getByText(/env=prod/);
    const removeBtn = badge.querySelector("button");
    fireEvent.click(removeBtn!);

    expect(screen.queryByText("1 repository matched")).toBeNull();
  });

  it("clears preview results when a label is added", () => {
    const onChange = vi.fn();
    const value = { match_formats: ["docker"] as string[] };
    render(<RepoSelectorForm value={value} onChange={onChange} />);

    act(() => {
      capturedMutationOpts.onSuccess({
        matched_repositories: [{ id: "1", key: "repo", format: "docker" }],
      });
    });
    expect(screen.getByText("1 repository matched")).toBeDefined();

    // Fill in label key and value, then press Enter on value input
    const keyInput = screen.getByPlaceholderText("key (e.g., env)");
    const valueInput = screen.getByPlaceholderText("value (e.g., production)");
    fireEvent.change(keyInput, { target: { value: "env" } });
    fireEvent.change(valueInput, { target: { value: "prod" } });
    fireEvent.keyDown(valueInput, { key: "Enter" });

    expect(screen.queryByText("1 repository matched")).toBeNull();
  });

  // hasFilters: enabled when match_labels is set
  it("enables the Preview button when labels are set", () => {
    renderForm({ match_labels: { env: "prod" } });

    const previewButton = screen.getByText("Preview Matched Repos").closest("button")!;
    expect(previewButton.disabled).toBe(false);
  });

  // hasFilters: enabled when match_pattern is set
  it("enables the Preview button when a pattern is set", () => {
    renderForm({ match_pattern: "libs-*" });

    const previewButton = screen.getByText("Preview Matched Repos").closest("button")!;
    expect(previewButton.disabled).toBe(false);
  });

  // mutationFn wires through to serviceAccountsApi.previewRepoSelector
  it("passes the selector to serviceAccountsApi.previewRepoSelector via mutationFn", async () => {
    const value = { match_formats: ["docker"] as string[] };
    render(<RepoSelectorForm value={value} onChange={vi.fn()} />);

    expect(capturedMutationOpts).toBeDefined();
    expect(capturedMutationOpts.mutationFn).toBeDefined();

    mockPreviewRepoSelector.mockResolvedValueOnce({
      matched_repositories: [],
      total: 0,
    });

    const selector = { match_formats: ["docker"] };
    await capturedMutationOpts.mutationFn(selector);

    expect(mockPreviewRepoSelector).toHaveBeenCalledWith(selector);
  });

  // Label merging with existing labels
  it("merges a new label with existing labels", () => {
    const { onChange } = renderForm({
      match_labels: { env: "prod" },
    });

    const keyInput = screen.getByPlaceholderText("key (e.g., env)");
    const valueInput = screen.getByPlaceholderText("value (e.g., production)");

    fireEvent.change(keyInput, { target: { value: "region" } });
    fireEvent.change(valueInput, { target: { value: "us-east" } });
    fireEvent.keyDown(valueInput, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        match_labels: { env: "prod", region: "us-east" },
      })
    );
  });

  // Checkbox checked state reflects value.match_formats
  it("checks the correct checkboxes based on match_formats", () => {
    renderForm({ match_formats: ["npm", "cargo"] });

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // docker=0, maven=1, npm=2, pypi=3, cargo=4
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(false);
    expect(checkboxes[2].checked).toBe(true); // npm
    expect(checkboxes[3].checked).toBe(false);
    expect(checkboxes[4].checked).toBe(true); // cargo
  });

  // Static text rendering
  it("renders descriptive text about formats and patterns", () => {
    renderForm();

    expect(screen.getByText("Formats")).toBeDefined();
    expect(screen.getByText("Name Pattern")).toBeDefined();
    expect(screen.getByText("Labels")).toBeDefined();
    expect(
      screen.getByText(/Restrict access to repositories of specific types/)
    ).toBeDefined();
  });
});
