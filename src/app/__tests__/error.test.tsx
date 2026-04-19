// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    AlertTriangle: stub("AlertTriangle"),
    RefreshCw: stub("RefreshCw"),
    Home: stub("Home"),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }: any) => {
    if (asChild) return <>{children}</>;
    return <button {...props}>{children}</button>;
  },
}));

import RootError from "../error";

describe("RootError", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the error heading and description", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<RootError error={error} reset={reset} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred/)
    ).toBeInTheDocument();
  });

  it("displays the error digest when present", () => {
    const error = Object.assign(new Error("test"), { digest: "root-abc" });
    const reset = vi.fn();

    render(<RootError error={error} reset={reset} />);

    expect(screen.getByText("Error ID: root-abc")).toBeInTheDocument();
  });

  it("does not display an error ID when digest is absent", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<RootError error={error} reset={reset} />);

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
  });

  it("calls reset when the Try again button is clicked", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<RootError error={error} reset={reset} />);

    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders a link back to the dashboard", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<RootError error={error} reset={reset} />);

    const link = screen.getByText("Dashboard").closest("a");
    expect(link).toHaveAttribute("href", "/");
  });

  it("logs the error to console.error", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("root boom") as Error & { digest?: string };
    const reset = vi.fn();

    render(<RootError error={error} reset={reset} />);

    expect(consoleSpy).toHaveBeenCalledWith("Root error:", error);
  });

  it("renders the AlertTriangle icon", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<RootError error={error} reset={reset} />);

    expect(screen.getByTestId("icon-AlertTriangle")).toBeInTheDocument();
  });
});
