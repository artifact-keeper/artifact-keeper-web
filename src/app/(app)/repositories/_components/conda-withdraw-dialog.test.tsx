// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockWithdraw = vi.fn();
const mockNotices = vi.fn();
vi.mock("@/lib/api/conda", () => ({
  condaApi: {
    withdraw: (...a: unknown[]) => mockWithdraw(...a),
    getNotices: (...a: unknown[]) => mockNotices(...a),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CondaWithdrawButton } from "./conda-withdraw-dialog";
import { ChannelNoticesPanel } from "./channel-notices-panel";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CondaWithdrawButton (#913)", () => {
  it("requires a reason, then confirms, then withdraws", async () => {
    mockWithdraw.mockResolvedValue({ withdrawn: true });
    const onWithdrawn = vi.fn();
    wrap(
      <CondaWithdrawButton
        repoKey="conda-internal"
        path="noarch/acme-core-1.0.0-py_0.conda"
        onWithdrawn={onWithdrawn}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Withdraw/ }));
    const cont = screen.getByRole("button", { name: "Continue" });
    expect(cont).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "CVE-2026-1" } });
    fireEvent.click(cont);
    expect(screen.getByTestId("withdraw-confirm")).toHaveTextContent(
      "Package acme-core-1.0.0-py_0.conda was withdrawn from this channel: CVE-2026-1",
    );
    expect(mockWithdraw).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw package" }));
    await waitFor(() =>
      expect(mockWithdraw).toHaveBeenCalledWith(
        "conda-internal",
        "noarch/acme-core-1.0.0-py_0.conda",
        "CVE-2026-1",
      ),
    );
    await waitFor(() => expect(onWithdrawn).toHaveBeenCalled());
  });
});

describe("ChannelNoticesPanel (#913)", () => {
  it("lists notices newest first", async () => {
    mockNotices.mockResolvedValue([
      { id: "1", message: "first notice", level: "info" },
      { id: "2", message: "second notice", level: "warning" },
    ]);
    wrap(<ChannelNoticesPanel repoKey="conda-internal" />);
    const second = await screen.findByText("second notice");
    const first = screen.getByText("first notice");
    expect(second.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the empty state", async () => {
    mockNotices.mockResolvedValue([]);
    wrap(<ChannelNoticesPanel repoKey="conda-internal" />);
    expect(await screen.findByText("No notices on this channel.")).toBeInTheDocument();
  });
});
