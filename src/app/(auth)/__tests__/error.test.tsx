// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    AlertTriangle: stub("AlertTriangle"),
    RefreshCw: stub("RefreshCw"),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
}));

import AuthError from "../error";

describe("AuthError", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the authentication error heading", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AuthError error={error} reset={reset} />);

    expect(screen.getByText("Authentication Error")).toBeInTheDocument();
  });

  it("renders the error description", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AuthError error={error} reset={reset} />);

    expect(
      screen.getByText(/Something went wrong during authentication/)
    ).toBeInTheDocument();
  });

  it("displays the error digest when present", () => {
    const error = Object.assign(new Error("test"), { digest: "auth-789" });
    const reset = vi.fn();

    render(<AuthError error={error} reset={reset} />);

    expect(screen.getByText("Error ID: auth-789")).toBeInTheDocument();
  });

  it("does not display an error ID when digest is absent", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AuthError error={error} reset={reset} />);

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
  });

  it("calls reset when the Try again button is clicked", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AuthError error={error} reset={reset} />);

    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("logs the error to console.error with auth prefix", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("auth boom") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AuthError error={error} reset={reset} />);

    expect(consoleSpy).toHaveBeenCalledWith("Auth route error:", error);
  });
});
