// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Database } from "lucide-react";

import { StatCard } from "../stat-card";

afterEach(cleanup);

describe("StatCard", () => {
  it("renders a link when given href (#822)", () => {
    render(<StatCard icon={Database} label="Repositories" value={9} href="/repositories" />);
    expect(screen.getByRole("link", { name: "Repositories: 9" })).toHaveAttribute(
      "href",
      "/repositories",
    );
  });

  it("is not a link without href", () => {
    render(<StatCard icon={Database} label="Users" value={3} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
