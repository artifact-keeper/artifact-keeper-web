// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

import AdminLoading from "../loading";

describe("AdminLoading", () => {
  afterEach(cleanup);

  it("renders skeleton placeholders", () => {
    render(<AdminLoading />);
    const skeletons = screen.getAllByTestId("skeleton");
    // Header (2) + table header (1) + table rows (8)
    expect(skeletons.length).toBe(11);
  });

  it("renders without crashing", () => {
    const { container } = render(<AdminLoading />);
    expect(container.firstChild).toBeTruthy();
  });
});
