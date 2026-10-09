// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const setTheme = vi.fn();
let currentTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: currentTheme, setTheme }),
}));

import { ThemeMenu } from "../theme-menu";

beforeEach(() => {
  setTheme.mockClear();
  currentTheme = "light";
});
afterEach(cleanup);

describe("ThemeMenu", () => {
  it("lists both light themes, dark and system", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);
    await user.click(screen.getByRole("button", { name: "Change theme" }));

    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Light",
      "Light (neutral)",
      "Dark",
      "System",
    ]);
  });

  it("marks the current theme as checked", async () => {
    currentTheme = "light-neutral";
    const user = userEvent.setup();
    render(<ThemeMenu />);
    await user.click(screen.getByRole("button", { name: "Change theme" }));

    expect(
      await screen.findByRole("menuitemradio", { name: "Light (neutral)" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("switches to the neutral light theme", async () => {
    const user = userEvent.setup();
    render(<ThemeMenu />);
    await user.click(screen.getByRole("button", { name: "Change theme" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Light (neutral)" }),
    );

    expect(setTheme).toHaveBeenCalledWith("light-neutral");
  });
});
