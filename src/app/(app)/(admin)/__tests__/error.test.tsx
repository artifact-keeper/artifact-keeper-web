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
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    ShieldAlert: stub("ShieldAlert"),
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

import AdminError from "../error";

describe("AdminError", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the admin error heading and description", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AdminError error={error} reset={reset} />);

    expect(screen.getByText("Administration Error")).toBeInTheDocument();
    expect(
      screen.getByText(/An error occurred in the administration panel/)
    ).toBeInTheDocument();
  });

  it("displays the error digest when present", () => {
    const error = Object.assign(new Error("test"), { digest: "admin-456" });
    const reset = vi.fn();

    render(<AdminError error={error} reset={reset} />);

    expect(screen.getByText("Error ID: admin-456")).toBeInTheDocument();
  });

  it("does not display an error ID when digest is absent", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AdminError error={error} reset={reset} />);

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
  });

  it("calls reset when the Try again button is clicked", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AdminError error={error} reset={reset} />);

    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders a Dashboard link pointing to /", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AdminError error={error} reset={reset} />);

    const link = screen.getByText("Dashboard").closest("a");
    expect(link).toHaveAttribute("href", "/");
  });

  it("logs the error to console.error with admin prefix", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("admin boom") as Error & { digest?: string };
    const reset = vi.fn();

    render(<AdminError error={error} reset={reset} />);

    expect(consoleSpy).toHaveBeenCalledWith("Admin route error:", error);
  });
});
