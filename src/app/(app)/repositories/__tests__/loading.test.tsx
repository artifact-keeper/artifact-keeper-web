// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

import RepositoriesLoading from "../loading";

describe("RepositoriesLoading", () => {
  afterEach(cleanup);

  it("renders skeleton placeholders", () => {
    render(<RepositoriesLoading />);
    const skeletons = screen.getAllByTestId("skeleton");
    // Header (1) + search + icon (2) + filters (2) + repo list (8)
    expect(skeletons.length).toBe(13);
  });

  it("renders without crashing", () => {
    const { container } = render(<RepositoriesLoading />);
    expect(container.firstChild).toBeTruthy();
  });
});
