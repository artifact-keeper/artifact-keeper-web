// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { axe } from "jest-axe";
import type { InstanceQuota, StorageQuota, TransferQuota } from "@/lib/quota";

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseInstanceQuota = vi.fn();
vi.mock("@/hooks/use-instance-quota", () => ({
  useInstanceQuota: () => mockUseInstanceQuota(),
}));

import { QuotaBanner, QUOTA_BANNER_DISMISS_KEY } from "../quota-banner";

const GiB = 1024 ** 3;

function storage(state: StorageQuota["state"], percent = 82): StorageQuota {
  return { quotaBytes: 10 * GiB, usedBytes: (percent / 100) * 10 * GiB, percent, warnPercent: 80, state };
}

function transfer(state: TransferQuota["state"], percent = 85): TransferQuota {
  return {
    quotaBytes: 50 * GiB,
    usedBytes: (percent / 100) * 50 * GiB,
    percent,
    warnPercent: 80,
    gracePercent: 25,
    hardLimitBytes: 62.5 * GiB,
    state,
    periodStart: "2026-11-01T00:00:00Z",
    periodEnd: "2026-12-01T00:00:00Z",
  };
}

function quota(overrides: Partial<InstanceQuota> = {}): InstanceQuota {
  return { storage: null, transfer: null, maxUploadBytes: null, helpUrl: null, ...overrides };
}

describe("QuotaBanner", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockUseAuth.mockReturnValue({ user: { is_admin: true }, isAuthenticated: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing when the backend reports no quotas", () => {
    mockUseInstanceQuota.mockReturnValue(null);
    const { container } = render(<QuotaBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while quotas are within limits", () => {
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("ok", 10), transfer: transfer("ok", 10) }));
    const { container } = render(<QuotaBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a storage warning as a status message", () => {
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("warning") }));
    render(<QuotaBanner />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Storage is at 82% of the quota (8.2 GiB / 10 GiB).");
    expect(notice).toHaveAttribute("data-tone", "warning");
  });

  it("shows an exceeded storage quota as an alert", () => {
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("exceeded", 100) }));
    render(<QuotaBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Storage quota reached: new uploads are refused; downloads still work. Delete artifacts or raise the quota.",
    );
  });

  it("tells a non-administrator to ask an administrator", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: false }, isAuthenticated: true });
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("exceeded", 100) }));
    render(<QuotaBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("ask an administrator to raise the quota");
  });

  it.each([
    ["warning", "status", "Downloads this month are at 85% of the transfer quota"],
    ["over", "alert", "Downloads still work for now, but will be refused after 62.5 GiB until Dec 1, 2026"],
    ["refusing", "alert", "downloads are refused until Dec 1, 2026"],
  ] as const)("shows the transfer %s state", (state, role, text) => {
    mockUseInstanceQuota.mockReturnValue(quota({ transfer: transfer(state) }));
    render(<QuotaBanner />);
    expect(screen.getByRole(role)).toHaveTextContent(text);
  });

  it("links the configured help page, opening in a new tab", () => {
    mockUseInstanceQuota.mockReturnValue(
      quota({ storage: storage("warning"), helpUrl: "https://example.com/quotas" }),
    );
    render(<QuotaBanner />);
    const link = screen.getByRole("link", { name: /Learn more/ });
    expect(link).toHaveAttribute("href", "https://example.com/quotas");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("has no link without a help URL", () => {
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("warning") }));
    render(<QuotaBanner />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("stays dismissed for the session until the state gets worse", () => {
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("warning") }));
    render(<QuotaBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss storage quota notice" }));
    expect(screen.queryByTestId("quota-banner")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(QUOTA_BANNER_DISMISS_KEY)!)).toEqual({ storage: 1 });

    // Same state, new mount (navigation or reload): still hidden.
    cleanup();
    const { rerender } = render(<QuotaBanner />);
    expect(screen.queryByTestId("quota-banner")).toBeNull();

    // Worse: shown again.
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("exceeded", 100) }));
    rerender(<QuotaBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Storage quota reached");
  });

  it("shows the notice again after the quota recovers and climbs back", () => {
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("warning") }));
    const { rerender } = render(<QuotaBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss storage quota notice" }));

    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("ok", 20) }));
    rerender(<QuotaBanner />);
    expect(JSON.parse(sessionStorage.getItem(QUOTA_BANNER_DISMISS_KEY)!)).toEqual({ storage: 0 });

    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("warning") }));
    rerender(<QuotaBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Storage is at 82%");
  });

  it("dismisses storage and transfer notices independently", () => {
    mockUseInstanceQuota.mockReturnValue(
      quota({ storage: storage("warning"), transfer: transfer("refusing", 130) }),
    );
    render(<QuotaBanner />);
    // Worst first.
    const notices = screen.getAllByTestId(/^quota-banner-/);
    expect(notices.map((n) => n.dataset.testid)).toEqual(["quota-banner-transfer", "quota-banner-storage"]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss transfer quota notice" }));
    expect(screen.queryByTestId("quota-banner-transfer")).toBeNull();
    expect(screen.getByTestId("quota-banner-storage")).toBeInTheDocument();
  });

  it("ignores a corrupt or unavailable session record", () => {
    sessionStorage.setItem(QUOTA_BANNER_DISMISS_KEY, "{not json");
    mockUseInstanceQuota.mockReturnValue(quota({ storage: storage("warning") }));
    render(<QuotaBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    cleanup();

    sessionStorage.setItem(QUOTA_BANNER_DISMISS_KEY, JSON.stringify({ storage: "x", transfer: 1 }));
    render(<QuotaBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    cleanup();

    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<QuotaBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss storage quota notice" }));
    expect(screen.queryByTestId("quota-banner")).toBeNull();
    spy.mockRestore();
  });

  it("has no accessibility violations", async () => {
    mockUseInstanceQuota.mockReturnValue(
      quota({ storage: storage("exceeded", 100), transfer: transfer("warning"), helpUrl: "https://example.com/q" }),
    );
    const { container } = render(<QuotaBanner />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
