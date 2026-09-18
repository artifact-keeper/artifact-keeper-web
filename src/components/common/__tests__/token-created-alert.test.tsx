// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  AlertTriangle: () => null,
  CalendarClock: () => null,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/dialog", () => ({
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/common/copy-button", () => ({
  CopyButton: ({ value }: any) => (
    <button data-testid="copy-button" data-value={value}>
      Copy
    </button>
  ),
}));

import { TokenCreatedAlert } from "@/components/common/token-created-alert";

function defaultProps(overrides: Partial<React.ComponentProps<typeof TokenCreatedAlert>> = {}) {
  return {
    title: "Token Created",
    description: "Your new token has been created successfully.",
    token: "ak_test_abc123xyz789",
    onDone: vi.fn(),
    ...overrides,
  };
}

describe("TokenCreatedAlert", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title and description", () => {
    render(
      <TokenCreatedAlert
        {...defaultProps({
          title: "API Key Created",
          description: "Your API key is ready to use.",
        })}
      />
    );
    expect(screen.getByText("API Key Created")).toBeInTheDocument();
    expect(screen.getByText("Your API key is ready to use.")).toBeInTheDocument();
  });

  it("displays the token string", () => {
    render(
      <TokenCreatedAlert
        {...defaultProps({ token: "sk_live_1234567890abcdef" })}
      />
    );
    expect(screen.getByText("sk_live_1234567890abcdef")).toBeInTheDocument();
  });

  it("renders the token inside a code element", () => {
    render(<TokenCreatedAlert {...defaultProps()} />);
    const codeEl = screen.getByText("ak_test_abc123xyz789");
    expect(codeEl.tagName).toBe("CODE");
  });

  it("renders CopyButton with correct value", () => {
    render(
      <TokenCreatedAlert
        {...defaultProps({ token: "my-secret-token-value" })}
      />
    );
    const copyButton = screen.getByTestId("copy-button");
    expect(copyButton).toBeInTheDocument();
    expect(copyButton).toHaveAttribute("data-value", "my-secret-token-value");
  });

  it("shows 'Store it safely' warning", () => {
    render(<TokenCreatedAlert {...defaultProps()} />);
    expect(screen.getByText("Store it safely")).toBeInTheDocument();
  });

  it("shows security warning about one-time display", () => {
    render(<TokenCreatedAlert {...defaultProps()} />);
    expect(
      screen.getByText(
        "This will only be shown once. Store it in a secure location."
      )
    ).toBeInTheDocument();
  });

  it("Done button calls onDone", () => {
    const onDone = vi.fn();
    render(<TokenCreatedAlert {...defaultProps({ onDone })} />);
    fireEvent.click(screen.getByText("Done"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("renders the Done button text", () => {
    render(<TokenCreatedAlert {...defaultProps()} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders title inside an h2 element", () => {
    render(<TokenCreatedAlert {...defaultProps({ title: "My Title" })} />);
    const heading = screen.getByText("My Title");
    expect(heading.tagName).toBe("H2");
  });

  it("renders description inside a p element", () => {
    render(
      <TokenCreatedAlert
        {...defaultProps({ description: "Some description" })}
      />
    );
    const desc = screen.getByText("Some description");
    expect(desc.tagName).toBe("P");
  });

  // -------------------------------------------------------------------------
  // Token expiry policy (#854, backend artifact-keeper#3460)
  // -------------------------------------------------------------------------

  it("reports 'Never expires' when the mint carries no expiry", () => {
    render(<TokenCreatedAlert {...defaultProps({ expiresAt: null })} />);
    expect(screen.getByText("Never expires")).toBeInTheDocument();
  });

  it("reports 'Never expires' when the backend omits expires_at entirely", () => {
    render(<TokenCreatedAlert {...defaultProps()} />);
    expect(screen.getByText("Never expires")).toBeInTheDocument();
  });

  it("shows the expiry the server stamped, with the raw instant as a title", () => {
    const expiresAt = "2026-12-17T09:30:00Z";
    render(<TokenCreatedAlert {...defaultProps({ expiresAt })} />);

    const expected = new Date(expiresAt).toLocaleDateString();
    const dateEl = screen.getByTitle(expiresAt);
    expect(dateEl).toHaveTextContent(expected);
    expect(screen.getByText(/Expires/)).toBeInTheDocument();
  });

  it("notes the instance policy when it set or clamped the expiry", () => {
    render(
      <TokenCreatedAlert
        {...defaultProps({
          expiresAt: "2026-12-17T09:30:00Z",
          policyApplied: true,
        })}
      />
    );
    expect(
      screen.getByText(/set by instance policy/)
    ).toBeInTheDocument();
  });

  it("omits the policy note when the mint used the requested expiry", () => {
    render(
      <TokenCreatedAlert
        {...defaultProps({
          expiresAt: "2026-12-17T09:30:00Z",
          policyApplied: false,
        })}
      />
    );
    expect(screen.queryByText(/set by instance policy/)).toBeNull();
  });

  it("falls back to 'Never expires' for an unparseable expires_at", () => {
    render(<TokenCreatedAlert {...defaultProps({ expiresAt: "not-a-date" })} />);
    expect(screen.getByText("Never expires")).toBeInTheDocument();
  });
});
