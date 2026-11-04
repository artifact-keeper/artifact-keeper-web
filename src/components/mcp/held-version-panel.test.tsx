// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { McpHoldProblem } from "@/types/mcp";
import { McpHeldVersionPanel, classifyHold } from "./held-version-panel";

afterEach(() => cleanup());

function held(problem: Partial<McpHoldProblem>) {
  return render(
    <McpHeldVersionPanel
      repoKey="mcp-local"
      name="com.acme/db"
      version="2.0.0"
      read={{ kind: "held", problem: { status: 404, ...problem } }}
    />,
  );
}

describe("McpHeldVersionPanel", () => {
  it.each([
    [{ hold: "quarantine", error: "mcp_pending_review" }, "Pending review"],
    [{ error: "mcp_rejected" }, "Refused by security policy"],
    [{ hold: "backing", gate: "quarantine", package: "npm:@acme/db-tool@2.0.0", error: "mcp_backing_artifact_blocked" }, "A package it runs is held"],
    [{ hold: "backing", gate: "scan_policy", package: "npm:@acme/db-tool@2.0.0", error: "mcp_backing_artifact_blocked" }, "A package it runs was refused"],
    [{ hold: "age_gate", error: "mcp_age_gate_blocked", gate: "age_gate", min_age_days: 7, requested_age_days: 2 }, "A package it runs is too new"],
    [{ hold: "unresolvable", error: "mcp_unresolvable", package: "oci:acme/db:2" }, "Pinned package is gone"],
    [{ hold: "resolving", error: "mcp_resolving" }, "Still resolving"],
    [{ hold: "curation", review_id: "r1" }, "Awaiting approval"],
    [{ error: "mcp_something_new" }, "Held"],
  ])("explains %o", (problem, title) => {
    held(problem as Partial<McpHoldProblem>);
    expect(screen.getByTestId("mcp-held-reason")).toHaveTextContent(title);
    expect(screen.getByText(/plain 404/)).toBeInTheDocument();
    expect(screen.getByText(/VS Code treats the server as not in the registry/)).toBeInTheDocument();
    expect(screen.getByText(/Releasing the hold restores the version on the next read/)).toBeInTheDocument();
  });

  it("names the package and the scan-policy refusal", () => {
    held({ hold: "backing", gate: "scan_policy", package: "npm:@acme/db-tool@2.0.0", error: "mcp_backing_artifact_blocked" });
    expect(screen.getByText("npm:@acme/db-tool@2.0.0")).toBeInTheDocument();
    expect(screen.getByText(/refused by a security policy/)).toBeInTheDocument();
  });

  it("links age-gate reviews and states the ages", () => {
    held({ error: "mcp_age_gate_blocked", gate: "age_gate", package: "npm:x@1", min_age_days: 7, requested_age_days: 2, review_id: "rev 1" });
    expect(screen.getByText(/at least 7 days; it is 2 days old/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Age Gate/ })).toHaveAttribute("href", "/age-gate?review=rev%201");
  });

  it("explains an age gate without a review", () => {
    held({ error: "mcp_age_gate_blocked", min_age_days: 3 });
    expect(screen.getByText(/at least 3 days\)/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links curation to the queue of the repository", () => {
    held({ hold: "pending_review", review_id: "r1" });
    expect(screen.getByRole("link", { name: /curation queue/ })).toHaveAttribute("href", "/curation?repo=mcp-local");
  });

  it("shows the server's detail line as text", () => {
    held({ hold: "quarantine", detail: "com.acme/db 2.0.0 is pending review" });
    expect(screen.getByText("com.acme/db 2.0.0 is pending review")).toBeInTheDocument();
  });

  it("stays neutral for the plain 404", () => {
    render(<McpHeldVersionPanel repoKey="k" name="com.acme/db" version="2.0.0" read={{ kind: "hidden" }} />);
    expect(screen.getByText(/held, deleted or not exist/)).toBeInTheDocument();
    expect(screen.getByText(/Only a holder of this repository can see why/)).toBeInTheDocument();
    expect(screen.queryByTestId("mcp-held-reason")).toBeNull();
  });

  it("asks to retry on 503", () => {
    render(<McpHeldVersionPanel repoKey="k" name="com.acme/db" version="2.0.0" read={{ kind: "unavailable" }} />);
    expect(screen.getByText(/Retry in a moment/)).toBeInTheDocument();
    expect(screen.getByText(/503/)).toBeInTheDocument();
  });

  it("renders nothing for a served version", () => {
    const { container } = render(
      <McpHeldVersionPanel repoKey="k" name="n/x" version="1" read={{ kind: "served", entry: { server: { name: "n/x", version: "1", description: "" } } }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("classifies a backing hold by gate", () => {
    expect(classifyHold({ status: 404, hold: "backing" })).toBe("backing_held");
    expect(classifyHold({ status: 404, gate: "curation" })).toBe("curation");
  });
});
