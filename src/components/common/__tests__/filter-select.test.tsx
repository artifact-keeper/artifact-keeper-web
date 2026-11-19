// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Radix's Select is unusable in jsdom, so stand it up as a native <select>
// that still exercises the value mapping this component is responsible for.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => (
    <select
      data-testid="select"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children, ...rest }: any) => (
    <optgroup {...rest} label="trigger">
      {children}
    </optgroup>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
}));

import { FilterSelect, FILTER_ALL } from "../filter-select";

const SEVERITIES = ["critical", "high"] as const;

describe("FilterSelect", () => {
  const onSelect = vi.fn();

  beforeEach(() => onSelect.mockReset());
  afterEach(cleanup);

  it("offers an all-option plus every value", () => {
    render(
      <FilterSelect
        label="Severity"
        options={SEVERITIES}
        onSelect={onSelect}
      />,
    );
    const options = screen
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual([FILTER_ALL, "critical", "high"]);
  });

  it("reports a chosen value to the caller", () => {
    render(
      <FilterSelect
        label="Severity"
        options={SEVERITIES}
        onSelect={onSelect}
      />,
    );
    fireEvent.change(screen.getByTestId("select"), {
      target: { value: "high" },
    });
    expect(onSelect).toHaveBeenCalledWith("high");
  });

  it("maps the all-option back to undefined, not the sentinel", () => {
    render(
      <FilterSelect
        label="Severity"
        options={SEVERITIES}
        active="high"
        onSelect={onSelect}
      />,
    );
    fireEvent.change(screen.getByTestId("select"), {
      target: { value: FILTER_ALL },
    });
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it("shows the active value as selected", () => {
    render(
      <FilterSelect
        label="Severity"
        options={SEVERITIES}
        active="critical"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByTestId("select")).toHaveValue("critical");
  });

  it("falls back to the sentinel when nothing is active", () => {
    render(
      <FilterSelect
        label="Severity"
        options={SEVERITIES}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByTestId("select")).toHaveValue(FILTER_ALL);
  });

  it("disables the control without removing it", () => {
    render(
      <FilterSelect
        label="Severity"
        options={SEVERITIES}
        onSelect={onSelect}
        disabled
      />,
    );
    expect(screen.getByTestId("select")).toBeDisabled();
  });

  it("sentence-cases raw values, so the trigger does not read lowercase", () => {
    render(
      <FilterSelect
        label="State"
        options={["pending", "running", "failed"] as const}
        onSelect={onSelect}
      />,
    );
    for (const name of ["Pending", "Running", "Failed"]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
  });

  it("leaves the all-label alone rather than title-casing it", () => {
    // A `capitalize` class on the trigger would render "All States" here.
    render(
      <FilterSelect
        label="State"
        allLabel="All states"
        options={["pending"] as const}
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByRole("option", { name: "All states" }),
    ).toBeInTheDocument();
  });

  it("reads underscored values as words", () => {
    render(
      <FilterSelect
        label="Kind"
        options={["hosted_artifact"] as const}
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Hosted artifact" }),
    ).toBeInTheDocument();
  });

  it("still prefers an explicit label over the derived one", () => {
    render(
      <FilterSelect
        label="Kind"
        options={["proxy_file"] as const}
        labels={{ proxy_file: "Proxy file" }}
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Proxy file" }),
    ).toBeInTheDocument();
  });

  it("uses a custom all-label when given one", () => {
    render(
      <FilterSelect
        label="State"
        allLabel="All states"
        options={SEVERITIES}
        onSelect={onSelect}
      />,
    );
    expect(
      screen.getByRole("option", { name: "All states" }),
    ).toBeInTheDocument();
  });

  // The trigger stub is an <optgroup> (the only legal child of a <select>),
  // so the props the real Radix trigger carries land there.
  function trigger(container: HTMLElement) {
    return container.querySelector("optgroup")!;
  }

  it("names the trigger for screen readers and the page tests", () => {
    const { container } = render(
      <FilterSelect label="Severity" options={SEVERITIES} onSelect={onSelect} />,
    );
    expect(trigger(container)).toHaveAttribute("aria-label", "Severity filter");
  });

  it("explains on hover why a disabled filter is disabled", () => {
    const { container } = render(
      <FilterSelect
        label="Severity"
        options={SEVERITIES}
        onSelect={onSelect}
        disabled
        disabledReason="Grouped by artifact."
      />,
    );
    expect(trigger(container)).toHaveAttribute("title", "Grouped by artifact.");
  });

  it("carries no stale tooltip when it is enabled", () => {
    const { container } = render(
      <FilterSelect
        label="Severity"
        options={SEVERITIES}
        onSelect={onSelect}
        disabledReason="Grouped by artifact."
      />,
    );
    expect(trigger(container)).not.toHaveAttribute("title");
  });
});
