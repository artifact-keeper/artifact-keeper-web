// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { axe } from "jest-axe";
import type { InstanceQuota, StorageQuota, TransferQuota } from "@/lib/quota";

const mockUseInstanceQuota = vi.fn();
vi.mock("@/hooks/use-instance-quota", () => ({
  useInstanceQuota: () => mockUseInstanceQuota(),
}));

import { QuotaUsageCards, QuotaUsageSection } from "../quota-usage-cards";

const GiB = 1024 ** 3;

function storage(state: StorageQuota["state"], usedBytes: number, quotaBytes = 150 * GiB): StorageQuota {
  return { quotaBytes, usedBytes, percent: (usedBytes / quotaBytes) * 100, warnPercent: 80, state };
}

function transfer(state: TransferQuota["state"], percent: number): TransferQuota {
  return {
    quotaBytes: 500 * GiB,
    usedBytes: (percent / 100) * 500 * GiB,
    percent,
    warnPercent: 80,
    gracePercent: 25,
    hardLimitBytes: 625 * GiB,
    state,
    periodStart: "2026-11-01T00:00:00Z",
    periodEnd: "2026-12-01T00:00:00Z",
  };
}

function quota(overrides: Partial<InstanceQuota> = {}): InstanceQuota {
  return { storage: null, transfer: null, maxUploadBytes: null, helpUrl: null, ...overrides };
}

describe("QuotaUsageCards", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing without quotas", () => {
    const { container, rerender } = render(<QuotaUsageCards quota={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<QuotaUsageCards quota={quota()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows storage used against the quota in binary units, with a bar", () => {
    render(<QuotaUsageCards quota={quota({ storage: storage("ok", 11274290864) })} />);
    const card = screen.getByTestId("quota-card-storage");
    expect(card).toHaveTextContent("Storage quota");
    expect(card).toHaveTextContent("10.5 GiB / 150 GiB");
    expect(card).toHaveTextContent("7%");
    expect(card).toHaveTextContent("Within quota");
    const bar = within(card).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "7");
    expect(bar).toHaveAttribute("aria-valuetext", "10.5 GiB / 150 GiB (7%)");
    expect(screen.queryByTestId("quota-card-transfer")).toBeNull();
  });

  it("names the warning and exceeded storage states in text", () => {
    const { rerender } = render(<QuotaUsageCards quota={quota({ storage: storage("warning", 123 * GiB) })} />);
    expect(screen.getByTestId("quota-card-storage")).toHaveTextContent("Nearly full");
    rerender(<QuotaUsageCards quota={quota({ storage: storage("exceeded", 151 * GiB) })} />);
    const card = screen.getByTestId("quota-card-storage");
    expect(card).toHaveTextContent("Quota reached: new uploads are refused");
    expect(card).toHaveTextContent("100%");
    // The bar is clamped at 100 even past the quota.
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it.each([
    ["ok", 10, "Within quota"],
    ["warning", 85, "Nearly used"],
    ["over", 110, "Over quota: downloads refused after 625 GiB"],
    ["refusing", 126, "Quota used up: downloads are refused"],
  ] as const)("shows the transfer %s state with its reset date", (state, percent, text) => {
    render(<QuotaUsageCards quota={quota({ transfer: transfer(state, percent) })} />);
    const card = screen.getByTestId("quota-card-transfer");
    expect(card).toHaveTextContent("Transfer this month");
    expect(card).toHaveTextContent(text);
    expect(card).toHaveTextContent("resets Dec 1, 2026");
  });

  it("omits the reset date when the backend does not report one", () => {
    render(<QuotaUsageCards quota={quota({ transfer: { ...transfer("ok", 1), periodEnd: null } })} />);
    expect(screen.getByTestId("quota-card-transfer")).not.toHaveTextContent("resets");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <QuotaUsageCards quota={quota({ storage: storage("warning", 123 * GiB), transfer: transfer("over", 110) })} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("QuotaUsageSection", () => {
  afterEach(() => cleanup());

  it("is hidden when no quota is configured or reported", () => {
    mockUseInstanceQuota.mockReturnValue(null);
    const { container, rerender } = render(<QuotaUsageSection />);
    expect(container).toBeEmptyDOMElement();
    mockUseInstanceQuota.mockReturnValue(quota({ maxUploadBytes: 5 }));
    rerender(<QuotaUsageSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a Quotas section when a quota is configured", () => {
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("ok", GiB) }));
    render(<QuotaUsageSection />);
    expect(screen.getByRole("heading", { name: "Quotas" })).toBeInTheDocument();
    expect(screen.getByTestId("quota-card-storage")).toBeInTheDocument();
  });
});
