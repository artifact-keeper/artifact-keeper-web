// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

import SearchLoading from "../loading";

describe("SearchLoading", () => {
  afterEach(cleanup);

  it("renders skeleton placeholders", () => {
    render(<SearchLoading />);
    const skeletons = screen.getAllByTestId("skeleton");
    // Search bar (1) + filter chips (3) + results (6)
    expect(skeletons.length).toBe(10);
  });

  it("renders without crashing", () => {
    const { container } = render(<SearchLoading />);
    expect(container.firstChild).toBeTruthy();
  });
});
