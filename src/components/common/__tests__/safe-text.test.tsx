// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { SafeText } from "../safe-text";

afterEach(cleanup);

describe("SafeText", () => {
  it("renders clean text as is, with no tooltip or marker", () => {
    render(<SafeText value="Reads files." />);
    const el = screen.getByText("Reads files.");
    expect(el.tagName).toBe("SPAN");
    expect(el).not.toHaveAttribute("title");
    expect(el).not.toHaveAttribute("data-sanitized");
  });

  it("shows control and bidi characters visibly and explains them", () => {
    render(<SafeText value={"\u202egnp.exe\u200b"} />);
    const el = screen.getByText("[U+202E]gnp.exe[U+200B]");
    expect(el).toHaveAttribute("data-sanitized", "true");
    expect(el.getAttribute("title")).toMatch(/2 hidden or control characters/);
    expect(el.textContent).not.toContain("\u202e");
  });

  it("uses the singular for one character", () => {
    render(<SafeText value={"a\u0007"} />);
    expect(screen.getByText("a[U+0007]").getAttribute("title")).toMatch(/1 hidden or control character,/);
  });

  it("cuts over-long text and puts the whole text in the tooltip", () => {
    render(<SafeText value={"w".repeat(30)} max={10} />);
    const el = screen.getByText(`${"w".repeat(10)}…`);
    expect(el).toHaveAttribute("title", "w".repeat(30));
  });

  it("renders the element it is told to and passes its attributes through", () => {
    render(<SafeText as="p" className="text-sm" data-testid="x" value="hi" />);
    const el = screen.getByTestId("x");
    expect(el.tagName).toBe("P");
    expect(el).toHaveClass("text-sm");
  });

  it("keeps a caller's own title when nothing was escaped or cut", () => {
    render(<SafeText title="Repository" value="demo" />);
    expect(screen.getByText("demo")).toHaveAttribute("title", "Repository");
  });

  it("renders nothing visible for null or undefined", () => {
    const { container } = render(<SafeText value={undefined} />);
    expect(container.textContent).toBe("");
  });

  it("renders markup as text, never as nodes", () => {
    const { container } = render(<SafeText value={'<img src=x onerror=alert(1)>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
