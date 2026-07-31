// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ListTruncationNotice } from "../list-truncation-notice";

afterEach(() => {
  cleanup();
});

describe("ListTruncationNotice", () => {
  it("renders nothing when the total fits within the shown items", () => {
    const { container } = render(<ListTruncationNotice shown={25} total={25} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when fewer items exist than were fetched", () => {
    const { container } = render(<ListTruncationNotice shown={25} total={10} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the server reports no total", () => {
    const { container } = render(<ListTruncationNotice shown={100} total={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the counts when the server reports more items than shown", () => {
    render(<ListTruncationNotice shown={100} total={1024} />);
    expect(
      screen.getByText(/Showing first 100 of 1024/)
    ).toBeInTheDocument();
  });

  it("exposes the notice as a polite live region", () => {
    render(<ListTruncationNotice shown={100} total={101} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing first 100 of 101"
    );
  });

  it("advises narrowing the results", () => {
    render(<ListTruncationNotice shown={100} total={101} />);
    expect(
      screen.getByText(/refine your search or filters/)
    ).toBeInTheDocument();
  });

  it("merges a custom className", () => {
    render(
      <ListTruncationNotice shown={1} total={2} className="mt-4" />
    );
    expect(screen.getByRole("status")).toHaveClass("mt-4");
  });
});
