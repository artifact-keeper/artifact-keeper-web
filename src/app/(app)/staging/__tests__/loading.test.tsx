// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

import StagingLoading from "../loading";

describe("StagingLoading", () => {
  afterEach(cleanup);

  it("renders skeleton placeholders", () => {
    render(<StagingLoading />);
    const skeletons = screen.getAllByTestId("skeleton");
    // Header (1) + grid items (6)
    expect(skeletons.length).toBe(7);
  });

  it("renders without crashing", () => {
    const { container } = render(<StagingLoading />);
    expect(container.firstChild).toBeTruthy();
  });
});
