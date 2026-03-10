// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

import ProtectedLoading from "../loading";

describe("ProtectedLoading", () => {
  afterEach(cleanup);

  it("renders skeleton placeholders", () => {
    render(<ProtectedLoading />);
    const skeletons = screen.getAllByTestId("skeleton");
    // Header (2) + table header (1) + table rows (6)
    expect(skeletons.length).toBe(9);
  });

  it("renders without crashing", () => {
    const { container } = render(<ProtectedLoading />);
    expect(container.firstChild).toBeTruthy();
  });
});
