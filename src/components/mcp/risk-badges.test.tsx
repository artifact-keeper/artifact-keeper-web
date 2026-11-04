// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { McpRiskBadges, McpRiskLevelBadge } from "./risk-badges";
import { McpTransportBadges } from "./transport-badges";
import { assessRisk } from "@/lib/mcp/risk";
import { EMPTY, WEATHER } from "./__tests__/mcp-fixtures";

afterEach(cleanup);

describe("McpRiskBadges", () => {
  const { signals } = assessRisk({ server: WEATHER.server, status: "deprecated", source: "mirror" });

  it("renders each signal as text with its reason in the accessible name", () => {
    render(<McpRiskBadges signals={signals} />);
    for (const s of signals) {
      expect(screen.getByLabelText(`${s.label}: ${s.reason}`)).toHaveTextContent(s.label);
    }
  });

  it("caps the list and counts the rest", () => {
    render(<McpRiskBadges signals={signals} max={1} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(`+${signals.length - 1} more`)).toBeInTheDocument();
  });

  it("renders nothing without signals", () => {
    const { container } = render(<McpRiskBadges signals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("McpRiskLevelBadge", () => {
  it.each([
    ["low", "Low risk"],
    ["medium", "Medium risk"],
    ["high", "High risk"],
    ["critical", "Critical risk"],
  ] as const)("%s reads %s", (level, text) => {
    render(<McpRiskLevelBadge level={level} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows the score when given", () => {
    render(<McpRiskLevelBadge level="high" score={6} />);
    expect(screen.getByText("(6)")).toBeInTheDocument();
  });
});

describe("McpTransportBadges", () => {
  it("lists distinct transports with a title", () => {
    render(<McpTransportBadges server={WEATHER.server} />);
    expect(screen.getByRole("list", { name: "Transports" })).toBeInTheDocument();
    expect(screen.getByText("stdio·npm")).toHaveAttribute("title", "Runs locally (stdio·npm)");
    expect(screen.getByText("http")).toHaveAttribute("title", "Remote http endpoint");
  });

  it("renders nothing for a server with no runners", () => {
    const { container } = render(<McpTransportBadges server={EMPTY.server} />);
    expect(container).toBeEmptyDOMElement();
  });
});
