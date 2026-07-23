// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  parseList,
  formatList,
  buildRpmConfigFields,
  buildDebianConfigFields,
  buildNpmScopePolicyFields,
  RpmTrustedKeyField,
  DebianConfigFields,
  NpmScopePolicyFields,
  EMPTY_RPM_CONFIG,
  EMPTY_DEBIAN_CONFIG,
  EMPTY_NPM_SCOPE_POLICY,
  type RpmConfigValue,
  type DebianConfigValue,
  type NpmScopePolicyValue,
} from "./format-config-fields";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => cleanup());

describe("parseList / formatList", () => {
  it("splits on commas and newlines, trims, and drops blanks", () => {
    expect(parseList("main, contrib\nnon-free ,, ")).toEqual([
      "main",
      "contrib",
      "non-free",
    ]);
  });

  it("returns an empty array for an empty/whitespace string", () => {
    expect(parseList("")).toEqual([]);
    expect(parseList("  ,  \n ")).toEqual([]);
  });

  it("formatList joins a list with ', '", () => {
    expect(formatList(["amd64", "arm64"])).toBe("amd64, arm64");
  });

  it("formatList tolerates null/undefined", () => {
    expect(formatList(undefined)).toBe("");
    expect(formatList(null)).toBe("");
  });

  it("parseList and formatList round-trip", () => {
    expect(parseList(formatList(["a", "b", "c"]))).toEqual(["a", "b", "c"]);
  });
});

describe("buildRpmConfigFields", () => {
  it("emits trusted_gpg_key when a key is present (trimmed)", () => {
    expect(buildRpmConfigFields({ trusted_gpg_key: "  KEYDATA  " })).toEqual({
      trusted_gpg_key: "KEYDATA",
    });
  });

  it("omits the field entirely when the key is blank", () => {
    expect(buildRpmConfigFields({ trusted_gpg_key: "   " })).toEqual({});
    expect(buildRpmConfigFields(EMPTY_RPM_CONFIG)).toEqual({});
  });
});

describe("buildDebianConfigFields", () => {
  it("maps apt_* metadata and parses the filter lists", () => {
    const value: DebianConfigValue = {
      apt_origin: "acme",
      apt_label: "Acme Mirror",
      apt_release_version: "12",
      apt_description: "internal",
      distribution_paths: "bookworm, bullseye",
      components: "main",
      architectures: "amd64, arm64",
    };
    expect(buildDebianConfigFields(value)).toEqual({
      apt_origin: "acme",
      apt_label: "Acme Mirror",
      apt_release_version: "12",
      apt_description: "internal",
      debian: {
        distribution_paths: ["bookworm", "bullseye"],
        components: ["main"],
        architectures: ["amd64", "arm64"],
      },
    });
  });

  it("sends undefined for blank metadata and empty arrays for blank filters", () => {
    expect(buildDebianConfigFields(EMPTY_DEBIAN_CONFIG)).toEqual({
      apt_origin: undefined,
      apt_label: undefined,
      apt_release_version: undefined,
      apt_description: undefined,
      debian: {
        distribution_paths: [],
        components: [],
        architectures: [],
      },
    });
  });
});

describe("buildNpmScopePolicyFields", () => {
  it("parses scope and pattern lists and carries the unscoped flag", () => {
    const value: NpmScopePolicyValue = {
      npm_allowed_scopes: "@acme, @internal",
      npm_allowed_name_patterns: "@acme*, internal-*",
      npm_allow_unscoped: true,
    };
    expect(buildNpmScopePolicyFields(value)).toEqual({
      npm_allowed_scopes: ["@acme", "@internal"],
      npm_allowed_name_patterns: ["@acme*", "internal-*"],
      npm_allow_unscoped: true,
    });
  });

  it("emits empty arrays and false for the empty policy", () => {
    expect(buildNpmScopePolicyFields(EMPTY_NPM_SCOPE_POLICY)).toEqual({
      npm_allowed_scopes: [],
      npm_allowed_name_patterns: [],
      npm_allow_unscoped: false,
    });
  });
});

describe("RpmTrustedKeyField", () => {
  it("reports edits through onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RpmTrustedKeyField
        idPrefix="t"
        value={EMPTY_RPM_CONFIG}
        onChange={onChange}
      />
    );
    await user.type(screen.getByLabelText(/trusted gpg public key/i), "A");
    expect(onChange).toHaveBeenCalledWith({ trusted_gpg_key: "A" });
  });

  it("shows the configured-key status only when a key exists", () => {
    const { rerender } = render(
      <RpmTrustedKeyField idPrefix="t" value={EMPTY_RPM_CONFIG} onChange={vi.fn()} />
    );
    expect(screen.queryByTestId("t-rpm-gpg-status")).toBeNull();

    rerender(
      <RpmTrustedKeyField
        idPrefix="t"
        value={EMPTY_RPM_CONFIG}
        onChange={vi.fn()}
        hasExistingKey
      />
    );
    expect(screen.getByTestId("t-rpm-gpg-status")).toBeTruthy();
  });

  it("renders a Remove button and fires onRemove when a key exists", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <RpmTrustedKeyField
        idPrefix="t"
        value={EMPTY_RPM_CONFIG}
        onChange={vi.fn()}
        hasExistingKey
        onRemove={onRemove}
      />
    );
    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("shows the removing state while a remove is pending", () => {
    render(
      <RpmTrustedKeyField
        idPrefix="t"
        value={EMPTY_RPM_CONFIG}
        onChange={vi.fn()}
        hasExistingKey
        onRemove={vi.fn()}
        removePending
      />
    );
    const btn = screen.getByRole("button", { name: /removing/i });
    expect(btn).toHaveProperty("disabled", true);
  });
});

describe("DebianConfigFields", () => {
  it("shows current values and reports edits without dropping other fields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value: DebianConfigValue = {
      ...EMPTY_DEBIAN_CONFIG,
      components: "main",
    };
    render(
      <DebianConfigFields idPrefix="t" value={value} onChange={onChange} />
    );

    expect((screen.getByLabelText(/^components$/i) as HTMLInputElement).value).toBe(
      "main"
    );

    await user.type(screen.getByLabelText(/architectures/i), "x");
    // Preserves the existing `components` while patching architectures.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ components: "main", architectures: "x" })
    );
  });

  it("edits every Debian field via onChange", async () => {
    const user = userEvent.setup();
    const cases: Array<[RegExp, keyof DebianConfigValue]> = [
      [/^origin$/i, "apt_origin"],
      [/^label$/i, "apt_label"],
      [/^version$/i, "apt_release_version"],
      [/^description$/i, "apt_description"],
      [/distributions/i, "distribution_paths"],
      [/^components$/i, "components"],
      [/architectures/i, "architectures"],
    ];
    for (const [label, key] of cases) {
      const onChange = vi.fn();
      const { unmount } = render(
        <DebianConfigFields
          idPrefix="t"
          value={EMPTY_DEBIAN_CONFIG}
          onChange={onChange}
        />
      );
      await user.type(screen.getByLabelText(label), "z");
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ [key]: "z" })
      );
      unmount();
    }
  });
});

describe("NpmScopePolicyFields", () => {
  it("edits the scopes list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NpmScopePolicyFields
        idPrefix="t"
        value={EMPTY_NPM_SCOPE_POLICY}
        onChange={onChange}
      />
    );
    await user.type(screen.getByLabelText(/allowed scopes/i), "@");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ npm_allowed_scopes: "@" })
    );
  });

  it("edits the name-patterns list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NpmScopePolicyFields
        idPrefix="t"
        value={EMPTY_NPM_SCOPE_POLICY}
        onChange={onChange}
      />
    );
    await user.type(screen.getByLabelText(/allowed name patterns/i), "x");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ npm_allowed_name_patterns: "x" })
    );
  });

  it("toggles the unscoped switch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NpmScopePolicyFields
        idPrefix="t"
        value={EMPTY_NPM_SCOPE_POLICY}
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ npm_allow_unscoped: true })
    );
  });
});
