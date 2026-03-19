// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

import AppLoading from "../loading";

describe("AppLoading", () => {
  afterEach(cleanup);

  it("renders skeleton placeholders", () => {
    render(<AppLoading />);
    const skeletons = screen.getAllByTestId("skeleton");
    // Page header (2) + stats row (4) + table header (1) + table rows (6)
    expect(skeletons.length).toBe(13);
  });

  it("renders without crashing", () => {
    const { container } = render(<AppLoading />);
    expect(container.firstChild).toBeTruthy();
  });
});
