// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MaintenanceCard, formatDriftBytes } from "../maintenance-card";

// Radix Select/AlertDialog need these DOM APIs jsdom does not implement.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const currentUser = vi.hoisted(() => ({ value: { is_admin: true } as unknown }));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: currentUser.value }),
}));

vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({
    data: {
      items: [
        { id: "r1", key: "maven-local" },
        { id: "r2", key: "npm-local" },
      ],
    },
  }),
}));

const backfillStorageLedger = vi.fn();
const backfillPackages = vi.fn();
vi.mock("@/lib/api/maintenance", () => ({
  maintenanceApi: {
    backfillStorageLedger: (...a: unknown[]) => backfillStorageLedger(...a),
    backfillPackages: (...a: unknown[]) => backfillPackages(...a),
  },
}));

const LEDGER_RESULT = {
  repositories_checked: 2,
  repositories_repaired: 1,
  repositories_skipped: 0,
  total_drift_bytes: 3072,
  before_total_storage_bytes: 1024,
  after_total_storage_bytes: 4096,
  repositories: [
    {
      repository_id: "r1",
      repository_key: "maven-local",
      before_total_bytes: null,
      after_total_bytes: 3072,
      after_hosted_bytes: 2048,
      after_proxy_bytes: 512,
      after_oci_bytes: 512,
      drift_bytes: 3072,
    },
    {
      repository_id: "r2",
      repository_key: "npm-local",
      before_total_bytes: 1024,
      after_total_bytes: 1024,
      after_hosted_bytes: 1024,
      after_proxy_bytes: 0,
      after_oci_bytes: 0,
      drift_bytes: 0,
    },
  ],
};

const PACKAGES_RESULT = {
  message: "Package catalog backfill completed",
  artifacts_scanned: 120,
  packages_registered: 100,
  artifacts_skipped: 18,
  artifacts_failed: 2,
};

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MaintenanceCard />
    </QueryClientProvider>,
  );
}

/** Open an action's confirm dialog and press its confirm button. */
async function runAction(trigger: RegExp, confirm: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: trigger }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: confirm }));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.value = { is_admin: true };
});

afterEach(() => cleanup());

describe("MaintenanceCard (#859)", () => {
  it("renders nothing for a non-admin", () => {
    currentUser.value = { is_admin: false };
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders both idle actions with no result panel", () => {
    renderCard();

    expect(screen.getByText("Maintenance")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Recompute Ledger/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Backfill Packages/i }),
    ).toBeEnabled();
    expect(screen.queryByText("Repositories checked")).not.toBeInTheDocument();
    expect(screen.queryByText("Artifacts scanned")).not.toBeInTheDocument();
    expect(backfillStorageLedger).not.toHaveBeenCalled();
  });

  it("confirms before running the ledger backfill", async () => {
    const user = userEvent.setup();
    backfillStorageLedger.mockResolvedValue(LEDGER_RESULT);
    renderCard();

    await user.click(screen.getByRole("button", { name: /Recompute Ledger/i }));
    expect(
      await screen.findByText("Recompute storage ledger?"),
    ).toBeInTheDocument();
    expect(backfillStorageLedger).not.toHaveBeenCalled();
  });

  it("shows a running state while the ledger backfill is in flight", async () => {
    backfillStorageLedger.mockReturnValue(new Promise(() => {}));
    renderCard();

    await runAction(/Recompute Ledger/i, /^Recompute$/);

    // The open dialog aria-hides the card behind it, so the trigger is reached
    // by text rather than by role.
    await waitFor(() =>
      expect(screen.getByText("Recomputing...").closest("button")).toBeDisabled(),
    );
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: /Processing/i })).toBeDisabled();
  });

  it("renders the drift table for the repaired repositories only", async () => {
    backfillStorageLedger.mockResolvedValue(LEDGER_RESULT);
    renderCard();

    await runAction(/Recompute Ledger/i, /^Recompute$/);

    expect(await screen.findByText("Repositories checked")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("maven-local")).toBeInTheDocument();
    // npm-local had zero drift, so the backfill changed nothing for it.
    expect(within(table).queryByText("npm-local")).not.toBeInTheDocument();
    expect(within(table).getByText("No ledger row")).toBeInTheDocument();
    expect(within(table).getByText("+3 KB")).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("reports a healthy instance instead of an empty drift table", async () => {
    backfillStorageLedger.mockResolvedValue({
      ...LEDGER_RESULT,
      repositories_repaired: 0,
      total_drift_bytes: 0,
      repositories: [LEDGER_RESULT.repositories[1]],
    });
    renderCard();

    await runAction(/Recompute Ledger/i, /^Recompute$/);

    expect(await screen.findByText(/No drift detected/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("surfaces a ledger backfill failure inline and in a toast", async () => {
    backfillStorageLedger.mockRejectedValue(
      new Error("API error 401: Admin privileges required"),
    );
    renderCard();

    await runAction(/Recompute Ledger/i, /^Recompute$/);

    expect(
      await screen.findByText(/Admin privileges required/),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("runs the package backfill unscoped by default and shows the counts", async () => {
    backfillPackages.mockResolvedValue(PACKAGES_RESULT);
    renderCard();

    await runAction(/Backfill Packages/i, /^Backfill$/);

    expect(await screen.findByText("Artifacts scanned")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(backfillPackages).toHaveBeenCalledWith(undefined);
  });

  it("scopes the package backfill to the picked repository", async () => {
    const user = userEvent.setup();
    backfillPackages.mockResolvedValue(PACKAGES_RESULT);
    renderCard();

    await user.click(screen.getByRole("combobox", { name: /Repository/i }));
    await user.click(await screen.findByRole("option", { name: "npm-local" }));

    await runAction(/Backfill Packages/i, /^Backfill$/);

    await waitFor(() =>
      expect(backfillPackages).toHaveBeenCalledWith("npm-local"),
    );
  });

  it("surfaces a package backfill failure inline", async () => {
    backfillPackages.mockRejectedValue(
      new Error("API error 404: Repository 'npm-local' not found"),
    );
    renderCard();

    await runAction(/Backfill Packages/i, /^Backfill$/);

    expect(await screen.findByText(/not found/)).toBeInTheDocument();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });
});

describe("formatDriftBytes", () => {
  it("signs a positive delta", () => {
    expect(formatDriftBytes(3072)).toBe("+3 KB");
  });

  it("signs a negative delta instead of returning the missing-value sentinel", () => {
    expect(formatDriftBytes(-2048)).toBe("-2 KB");
  });

  it("renders a zero delta without a sign", () => {
    expect(formatDriftBytes(0)).toBe("0 B");
  });

  it("falls back to the byte formatter for non-finite input", () => {
    expect(formatDriftBytes(Number.NaN)).toBe("--");
  });
});
