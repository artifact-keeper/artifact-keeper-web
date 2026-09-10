// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { VisibilitySelect, resolveVisibility } from "./visibility-select";

// radix Select needs these in jsdom, same as `release-target-settings.test.tsx`
// and `repo-settings-tab.test.tsx` do for their own Selects.
beforeAll(() => {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
  (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

describe("resolveVisibility", () => {
  it("prefers the explicit field over the legacy boolean", () => {
    // An `internal` repository carries `is_public: false`, so a reader that
    // consulted the boolean would render it as private — the exact
    // degradation this helper exists to avoid on a current backend.
    expect(resolveVisibility({ visibility: "internal", is_public: false })).toBe(
      "internal"
    );
    expect(resolveVisibility({ visibility: "public", is_public: true })).toBe(
      "public"
    );
  });

  it("falls back to the legacy boolean when the backend predates the field", () => {
    expect(resolveVisibility({ is_public: true })).toBe("public");
    expect(resolveVisibility({ is_public: false })).toBe("private");
    // Neither field present: the safe reading is the narrow one.
    expect(resolveVisibility({})).toBe("private");
  });
});

describe("VisibilitySelect", () => {
  function renderSelect(
    props: Partial<React.ComponentProps<typeof VisibilitySelect>> = {}
  ) {
    const onChange = vi.fn();
    render(
      <VisibilitySelect
        idPrefix="test"
        value="private"
        onChange={onChange}
        guestAccessEnabled
        {...props}
      />
    );
    return { onChange };
  }

  it("labels the control and ties the label to the trigger", () => {
    renderSelect();
    const trigger = screen.getByLabelText("Visibility");
    expect(trigger).toHaveAttribute("id", "test-visibility");
  });

  it("offers all three states when guest access is enabled", () => {
    renderSelect();
    fireEvent.click(screen.getByRole("combobox"));

    expect(screen.getByRole("option", { name: "Public" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Internal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Private" })).toBeInTheDocument();
  });

  it("reports the selected state to the caller", () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Internal" }));

    expect(onChange).toHaveBeenCalledWith("internal");
  });

  it("shows the hint for the active state", () => {
    renderSelect({ value: "internal" });
    expect(
      screen.getByText("Any signed-in user can read. Never readable anonymously.")
    ).toBeInTheDocument();
  });

  it("withdraws public — but keeps internal and private — when guest access is off", () => {
    renderSelect({ guestAccessEnabled: false });

    // The control stays: with guests off, `public` is unavailable but the
    // choice between `internal` and `private` is still the operator's.
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("option", { name: "Public" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Internal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Private" })).toBeInTheDocument();
    expect(
      screen.getByText(/Public repositories are disabled by the operator/)
    ).toBeInTheDocument();
  });

  it("still renders an already-public repository's own value when guest access is off", () => {
    // Set before the policy changed. Dropping the option would leave the
    // trigger empty and let any save silently move the repository.
    renderSelect({ guestAccessEnabled: false, value: "public" });

    expect(screen.getByRole("combobox")).toHaveTextContent("Public");
    expect(
      screen.getByText("Anyone can read, including unauthenticated callers.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Public" })).toBeInTheDocument();
  });

  it("disables the trigger when asked", () => {
    renderSelect({ disabled: true });
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
