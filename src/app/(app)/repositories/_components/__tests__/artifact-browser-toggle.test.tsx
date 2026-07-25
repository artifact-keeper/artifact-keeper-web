// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ArtifactBrowserToggle,
  supportsGrouping,
  supportsTree,
} from "../artifact-browser-toggle";
import type { RepositoryFormat } from "@/types";

const NOOP = () => {};

describe("supportsGrouping", () => {
  it.each<[RepositoryFormat, boolean]>([
    ["maven", true],
    ["gradle", true],
    ["docker", true],
    ["npm", false],
    ["pypi", false],
    ["helm", false],
    ["generic", false],
    ["podman", false],
  ])("returns %s for %s repos", (format, expected) => {
    expect(supportsGrouping(format)).toBe(expected);
  });
});

describe("supportsTree", () => {
  it.each<[RepositoryFormat, boolean]>([
    ["generic", true],
    ["maven", false],
    ["docker", false],
    ["npm", false],
    ["helm", false],
  ])("returns %s for %s repos", (format, expected) => {
    expect(supportsTree(format)).toBe(expected);
  });
});

describe("ArtifactBrowserToggle — tree (RAW/Generic)", () => {
  afterEach(cleanup);

  it("renders a Flat/Tree toggle for generic repositories", () => {
    render(
      <ArtifactBrowserToggle value="flat" onChange={NOOP} format="generic" />,
    );
    expect(screen.getByTestId("artifact-browser-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-flat")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-tree")).toBeInTheDocument();
    expect(screen.queryByTestId("toggle-grouped")).not.toBeInTheDocument();
  });

  it("marks the tree button pressed when value=tree", () => {
    render(
      <ArtifactBrowserToggle value="tree" onChange={NOOP} format="generic" />,
    );
    expect(screen.getByTestId("toggle-tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("toggle-flat")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("invokes onChange('tree') when the Tree button is clicked", async () => {
    const onChange = vi.fn();
    render(
      <ArtifactBrowserToggle value="flat" onChange={onChange} format="generic" />,
    );
    await userEvent.click(screen.getByTestId("toggle-tree"));
    expect(onChange).toHaveBeenCalledWith("tree");
  });

  it("renders nothing for formats with neither grouping nor tree (npm)", () => {
    const { container } = render(
      <ArtifactBrowserToggle value="flat" onChange={NOOP} format="npm" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ArtifactBrowserToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  describe("visibility", () => {
    it("renders the toggle for maven repositories", () => {
      render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="maven" />,
      );
      expect(screen.getByTestId("artifact-browser-toggle")).toBeInTheDocument();
    });

    it("renders the toggle for gradle repositories", () => {
      render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="gradle" />,
      );
      expect(screen.getByTestId("artifact-browser-toggle")).toBeInTheDocument();
    });

    it("renders the toggle for docker repositories", () => {
      render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="docker" />,
      );
      expect(screen.getByTestId("artifact-browser-toggle")).toBeInTheDocument();
    });

    it("renders nothing for non-groupable formats (npm)", () => {
      const { container } = render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="npm" />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing for non-groupable formats (helm)", () => {
      const { container } = render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="helm" />,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("labels", () => {
    it('uses "Group by component" for maven repos', () => {
      render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="maven" />,
      );
      expect(
        screen.getByRole("button", { name: /group by component/i }),
      ).toBeInTheDocument();
    });

    it('uses "Group by component" for gradle repos', () => {
      render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="gradle" />,
      );
      expect(
        screen.getByRole("button", { name: /group by component/i }),
      ).toBeInTheDocument();
    });

    it('uses "Group by tag" for docker repos', () => {
      render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="docker" />,
      );
      expect(
        screen.getByRole("button", { name: /group by tag/i }),
      ).toBeInTheDocument();
    });
  });

  describe("aria-pressed reflects selected state", () => {
    it("flat is pressed when value=flat", () => {
      render(
        <ArtifactBrowserToggle value="flat" onChange={NOOP} format="maven" />,
      );
      expect(screen.getByTestId("toggle-flat")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId("toggle-grouped")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("grouped is pressed when value=grouped", () => {
      render(
        <ArtifactBrowserToggle
          value="grouped"
          onChange={NOOP}
          format="maven"
        />,
      );
      expect(screen.getByTestId("toggle-grouped")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId("toggle-flat")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  describe("onChange", () => {
    it("invokes onChange('flat') when the Flat button is clicked", async () => {
      const onChange = vi.fn();
      render(
        <ArtifactBrowserToggle
          value="grouped"
          onChange={onChange}
          format="maven"
        />,
      );
      await userEvent.click(screen.getByTestId("toggle-flat"));
      expect(onChange).toHaveBeenCalledWith("flat");
    });

    it("invokes onChange('grouped') when the Grouped button is clicked", async () => {
      const onChange = vi.fn();
      render(
        <ArtifactBrowserToggle
          value="flat"
          onChange={onChange}
          format="maven"
        />,
      );
      await userEvent.click(screen.getByTestId("toggle-grouped"));
      expect(onChange).toHaveBeenCalledWith("grouped");
    });
  });

  it("exposes a labelled radio-style group container", () => {
    render(
      <ArtifactBrowserToggle value="flat" onChange={NOOP} format="maven" />,
    );
    expect(
      screen.getByRole("group", { name: /artifact view mode/i }),
    ).toBeInTheDocument();
  });
});
