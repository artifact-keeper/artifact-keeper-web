// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { BuildMetadata, BuildUrl } from "../build-links";

afterEach(cleanup);

describe("BuildUrl", () => {
  it("links an https url in a new tab without an opener", () => {
    render(<BuildUrl url="https://vcs.example.test/org/repo" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://vcs.example.test/org/repo");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "/relative/path"])(
    "prints %s as text, never a link",
    (url) => {
      render(<BuildUrl url={url} />);
      expect(screen.getByText(url)).toBeDefined();
      expect(screen.queryByRole("link")).toBeNull();
      expect(document.querySelector("a")).toBeNull();
    },
  );
});

describe("BuildMetadata", () => {
  it("renders keys and values as text, http(s) values as links", () => {
    render(
      <BuildMetadata
        metadata={{
          pipeline_url: "https://ci.example.test/p/1",
          job_url: "javascript:alert(1)",
          runner: "linux-amd64",
          attempt: 2,
          labels: { a: "<b>x</b>" },
        }}
      />,
    );
    expect(screen.getByText("pipeline_url")).toBeDefined();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://ci.example.test/p/1");
    expect(screen.getByText("javascript:alert(1)")).toBeDefined();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText("linux-amd64")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText('{"a":"<b>x</b>"}')).toBeDefined();
    expect(document.querySelector("b")).toBeNull();
  });

  it("renders nothing without metadata", () => {
    const { container } = render(<BuildMetadata metadata={undefined} />);
    expect(container.innerHTML).toBe("");
    render(<BuildMetadata metadata={{}} />);
    expect(screen.queryByTestId("build-metadata")).toBeNull();
  });

  it("prints a non-object metadata value as json text", () => {
    render(<BuildMetadata metadata={["x"] as unknown as Record<string, unknown>} />);
    expect(screen.getByTestId("build-metadata").textContent).toBe('["x"]');
  });
});
