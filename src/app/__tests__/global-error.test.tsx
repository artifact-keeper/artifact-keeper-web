// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import GlobalError from "../global-error";

describe("GlobalError", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a full html document with lang attribute", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    // JSDOM hoists <html> to document level rather than keeping it inside
    // the render container, so we query the document directly.
    const html = document.querySelector("html");
    expect(html).toBeInTheDocument();
    expect(html).toHaveAttribute("lang", "en");
  });

  it("renders the Artifact Keeper logo", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    const img = screen.getByAltText("Artifact Keeper");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/logo-48.png");
    expect(img).toHaveAttribute("width", "48");
    expect(img).toHaveAttribute("height", "48");
  });

  it("renders the error heading", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders the error description", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(
      screen.getByText(/A critical error prevented this page from loading/)
    ).toBeInTheDocument();
  });

  it("displays the error digest when present", () => {
    const error = Object.assign(new Error("test"), { digest: "global-xyz" });
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.getByText("Error ID: global-xyz")).toBeInTheDocument();
  });

  it("does not display an error ID when digest is absent", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument();
  });

  it("calls reset when the Try again button is clicked", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    fireEvent.click(screen.getByText("Try again"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders a link to the home page", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    const link = screen.getByText("Go to home page");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("logs the error to console.error", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("global boom") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(consoleSpy).toHaveBeenCalledWith("Global error:", error);
  });

  it("renders a body element", () => {
    const error = new Error("test") as Error & { digest?: string };
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    // JSDOM hoists <body> to the document level.
    const body = document.querySelector("body");
    expect(body).toBeInTheDocument();
  });
});
