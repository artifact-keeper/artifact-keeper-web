// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PolicyExclusions } from "@/types/lifecycle";
import { ExclusionsEditor } from "./exclusions-editor";

afterEach(() => cleanup());

const EMPTY: PolicyExclusions = { versions: [], version_patterns: [] };

/** Stateful host so add/remove round-trip the way the create dialog does. */
function Harness({
  initial = EMPTY,
  onChange,
  versionsError,
  patternsError,
}: {
  initial?: PolicyExclusions;
  onChange?: (next: PolicyExclusions) => void;
  versionsError?: string | null;
  patternsError?: string | null;
}) {
  const [value, setValue] = useState<PolicyExclusions>(initial);
  return (
    <ExclusionsEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      versionsError={versionsError}
      patternsError={patternsError}
    />
  );
}

const versionInput = () => screen.getByLabelText("Keep these versions");
const patternInput = () => screen.getByLabelText("Keep versions matching");

describe("ExclusionsEditor", () => {
  it("adds an exact version and reports it upward", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(versionInput(), "latest");
    await user.click(screen.getByRole("button", { name: "Add version" }));

    expect(onChange).toHaveBeenCalledWith({
      versions: ["latest"],
      version_patterns: [],
    });
    expect(
      screen.getByRole("button", { name: "Remove version latest" })
    ).toBeInTheDocument();
    // The draft is cleared so the next entry starts from empty.
    expect(versionInput()).toHaveValue("");
  });

  it("adds an entry when Enter is pressed in the input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(patternInput(), "^v\\d+$[Enter]");

    expect(onChange).toHaveBeenCalledWith({
      versions: [],
      version_patterns: ["^v\\d+$"],
    });
  });

  it("removes an entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness
        initial={{ versions: ["latest", "stable"], version_patterns: [] }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove version latest" }));

    expect(onChange).toHaveBeenCalledWith({
      versions: ["stable"],
      version_patterns: [],
    });
  });

  it("rejects an invalid regex client-side instead of sending it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(patternInput(), "^v(\\d+");
    await user.click(screen.getByRole("button", { name: "Add pattern" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not a valid regular expression."
    );
    expect(onChange).not.toHaveBeenCalled();
    // The typed value is kept so it can be corrected rather than retyped.
    expect(patternInput()).toHaveValue("^v(\\d+");
  });

  it("rejects a duplicate entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness initial={{ versions: ["latest"], version_patterns: [] }} onChange={onChange} />
    );

    await user.type(versionInput(), "latest");
    await user.click(screen.getByRole("button", { name: "Add version" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      '"latest" is already in the list.'
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("trims whitespace and cannot add a blank entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    // The backend refuses empty entries, so Add stays disabled for whitespace
    // and Enter (which bypasses the button) says so instead of adding "".
    await user.type(versionInput(), "   ");
    expect(screen.getByRole("button", { name: "Add version" })).toBeDisabled();
    await user.type(versionInput(), "[Enter]");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a version first.");
    expect(onChange).not.toHaveBeenCalled();

    await user.type(versionInput(), "1.4.2  ");
    await user.click(screen.getByRole("button", { name: "Add version" }));
    expect(onChange).toHaveBeenCalledWith({
      versions: ["1.4.2"],
      version_patterns: [],
    });
  });

  it("renders a backend rejection under the list it names", () => {
    render(
      <Harness patternsError="Invalid regex in exclude.version_patterns: unclosed group" />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid regex in exclude.version_patterns: unclosed group"
    );
    expect(patternInput()).toHaveAttribute("aria-invalid", "true");
    expect(versionInput()).not.toHaveAttribute("aria-invalid");
  });
});
