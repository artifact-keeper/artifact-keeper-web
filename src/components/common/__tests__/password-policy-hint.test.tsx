// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  Check: (props: any) => <span data-testid="icon-check" {...props} />,
  X: (props: any) => <span data-testid="icon-x" {...props} />,
}));

const mockGetPasswordPolicy = vi.fn();

vi.mock("@/lib/api/settings", () => ({
  settingsApi: {
    getPasswordPolicy: (...args: unknown[]) => mockGetPasswordPolicy(...args),
    DEFAULT_PASSWORD_POLICY: {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_digit: true,
      require_special: false,
      history_count: 5,
    },
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// Mock TanStack Query to return data synchronously
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false, error: null }),
}));

import { PasswordPolicyHint } from "@/components/common/password-policy-hint";

describe("PasswordPolicyHint", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the requirements heading", () => {
    render(<PasswordPolicyHint />);
    expect(screen.getByText("Password requirements")).toBeInTheDocument();
  });

  it("renders the minimum length requirement", () => {
    render(<PasswordPolicyHint />);
    expect(screen.getByText("Minimum 8 characters")).toBeInTheDocument();
  });

  it("renders uppercase requirement when required", () => {
    render(<PasswordPolicyHint />);
    expect(
      screen.getByText("At least one uppercase letter")
    ).toBeInTheDocument();
  });

  it("renders lowercase requirement when required", () => {
    render(<PasswordPolicyHint />);
    expect(
      screen.getByText("At least one lowercase letter")
    ).toBeInTheDocument();
  });

  it("renders digit requirement when required", () => {
    render(<PasswordPolicyHint />);
    expect(screen.getByText("At least one number")).toBeInTheDocument();
  });

  it("renders password history notice", () => {
    render(<PasswordPolicyHint />);
    expect(
      screen.getByText("Cannot reuse your last 5 passwords")
    ).toBeInTheDocument();
  });

  it("does not render special character requirement when not required", () => {
    render(<PasswordPolicyHint />);
    expect(
      screen.queryByText("At least one special character")
    ).not.toBeInTheDocument();
  });

  it("shows neutral indicators when no password is provided", () => {
    render(<PasswordPolicyHint />);
    // No check or X icons should appear when password is empty
    expect(screen.queryAllByTestId("icon-check")).toHaveLength(0);
    expect(screen.queryAllByTestId("icon-x")).toHaveLength(0);
  });

  it("shows check icons for met rules when password is provided", () => {
    render(<PasswordPolicyHint password="Abcdefgh1" />);
    // Length (9 >= 8), uppercase (A), lowercase (bcdefgh), digit (1) should all pass
    const checks = screen.getAllByTestId("icon-check");
    expect(checks.length).toBe(4);
  });

  it("shows X icons for unmet rules when password is provided", () => {
    render(<PasswordPolicyHint password="abc" />);
    // Length not met, no uppercase, lowercase met, no digit
    const xs = screen.getAllByTestId("icon-x");
    expect(xs.length).toBeGreaterThan(0);
  });

  it("has correct aria-label on container", () => {
    render(<PasswordPolicyHint />);
    const list = screen.getByRole("list", { name: "Password requirements" });
    expect(list).toBeInTheDocument();
  });

  it("renders list items with role", () => {
    render(<PasswordPolicyHint />);
    const items = screen.getAllByRole("listitem");
    // min length + uppercase + lowercase + digit + history = 5 items
    expect(items.length).toBe(5);
  });

  it("applies additional className", () => {
    render(<PasswordPolicyHint className="mt-4" />);
    const list = screen.getByRole("list");
    expect(list.className).toContain("mt-4");
  });
});
