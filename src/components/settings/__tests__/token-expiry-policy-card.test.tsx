// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

beforeAll(() => {
  // Radix's Switch measures its thumb through ResizeObserver, which jsdom
  // does not implement.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
  CSRF_HEADER_NAME: "X-Requested-With",
  CSRF_HEADER_VALUE: "XMLHttpRequest",
}));

const mockGet = vi.fn();
const mockUpdate = vi.fn();
// Only the transport is stubbed: the 409/400 classification helpers and the
// day ceiling under test are the production ones.
vi.mock("@/lib/api/token-policy", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/token-policy")>(
      "@/lib/api/token-policy",
    );
  return {
    ...actual,
    tokenPolicyApi: {
      get: (...args: unknown[]) => mockGet(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  };
});

import { toast } from "sonner";
import { ApiError } from "@/lib/api/fetch";
import type { TokenPolicySettings } from "@/lib/api/token-policy";
import {
  POLICY_PINNED_MESSAGE,
  TokenExpiryPolicyCard,
} from "../token-expiry-policy-card";

const EDITABLE: TokenPolicySettings = {
  policy: {
    require_expiration: true,
    min_days: 7,
    max_days: 365,
    default_days: 90,
    apply_to_service_accounts: false,
  },
  source: "database",
  editable: true,
  non_expiring_user_tokens: 3,
  non_expiring_service_account_tokens: 1,
};

const PINNED: TokenPolicySettings = {
  ...EDITABLE,
  source: "environment",
  editable: false,
};

/** The backend's error envelope: `{ code, message }` JSON. */
function apiError(status: number, message: string): ApiError {
  return new ApiError(status, JSON.stringify({ code: "ERR", message }));
}

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TokenExpiryPolicyCard />
    </QueryClientProvider>,
  );
}

function daysInput(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue(EDITABLE);
  mockUpdate.mockResolvedValue(EDITABLE);
});

afterEach(() => cleanup());

describe("TokenExpiryPolicyCard — editable (#810)", () => {
  it("seeds the form from the stored policy", async () => {
    renderCard();

    await waitFor(() => expect(daysInput("Minimum days").value).toBe("7"));
    expect(daysInput("Maximum days").value).toBe("365");
    expect(daysInput("Default days").value).toBe("90");
    expect(screen.getByLabelText("Require expiration")).toBeChecked();
    expect(screen.getByLabelText("Apply to service accounts")).not.toBeChecked();
  });

  it("does not claim an environment pin and leaves the form editable", async () => {
    renderCard();

    await waitFor(() => expect(daysInput("Minimum days")).toBeEnabled());
    expect(screen.queryByText("Pinned by environment")).toBeNull();
    expect(screen.queryByText("Read-only")).toBeNull();
    expect(screen.getByRole("button", { name: /save policy/i })).toBeEnabled();
  });

  it("lists the never-expiring tokens as a rotation to-do", async () => {
    renderCard();

    await waitFor(() => expect(screen.getByText("Rotation to-do")).toBeInTheDocument());
    expect(
      screen.getByText(/3 user tokens and 1 service-account token never expire/),
    ).toBeInTheDocument();
  });

  it("says there is nothing to rotate when every token already expires", async () => {
    mockGet.mockResolvedValue({
      ...EDITABLE,
      non_expiring_user_tokens: 0,
      non_expiring_service_account_tokens: 0,
    });
    renderCard();

    await waitFor(() =>
      expect(screen.getByText(/Rotation to-do: none/)).toBeInTheDocument(),
    );
  });

  it("saves the edited policy and confirms", async () => {
    renderCard();
    await waitFor(() => expect(daysInput("Minimum days").value).toBe("7"));

    fireEvent.change(daysInput("Maximum days"), { target: { value: "180" } });
    fireEvent.change(daysInput("Default days"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save policy/i }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        require_expiration: true,
        min_days: 7,
        max_days: 180,
        default_days: null,
        apply_to_service_accounts: false,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Token expiry policy saved"),
    );
  });

  it("refuses an inconsistent range client-side without calling the backend", async () => {
    renderCard();
    await waitFor(() => expect(daysInput("Minimum days").value).toBe("7"));

    fireEvent.change(daysInput("Maximum days"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /save policy/i }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Maximum must be greater than or equal to the minimum",
        ),
      ).toBeInTheDocument(),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("TokenExpiryPolicyCard — pinned by environment", () => {
  it("badges the pin, explains it, and disables every control", async () => {
    mockGet.mockResolvedValue(PINNED);
    renderCard();

    await waitFor(() =>
      expect(screen.getByText("Pinned by environment")).toBeInTheDocument(),
    );
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByText(POLICY_PINNED_MESSAGE)).toBeInTheDocument();
    expect(daysInput("Minimum days")).toBeDisabled();
    expect(daysInput("Maximum days")).toBeDisabled();
    expect(daysInput("Default days")).toBeDisabled();
    expect(screen.getByLabelText("Require expiration")).toBeDisabled();
    expect(screen.getByRole("button", { name: /save policy/i })).toBeDisabled();
  });
});

describe("TokenExpiryPolicyCard — backend refusals", () => {
  it("shows the 409 verbatim and re-reads the policy (409)", async () => {
    const message =
      "The API token expiration policy is pinned by the " +
      "API_TOKEN_EXPIRATION_* environment variables and cannot be changed " +
      "through the API.";
    mockUpdate.mockRejectedValue(apiError(409, message));
    renderCard();
    await waitFor(() => expect(daysInput("Minimum days").value).toBe("7"));

    fireEvent.click(screen.getByRole("button", { name: /save policy/i }));

    await waitFor(() =>
      expect(screen.getByText("Policy not saved")).toBeInTheDocument(),
    );
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(message);
    // The pin may have appeared since load, so the read is refreshed.
    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThan(1));
  });

  it("falls back to a clear message when the 409 body carries none", async () => {
    mockUpdate.mockRejectedValue(new ApiError(409, ""));
    renderCard();
    await waitFor(() => expect(daysInput("Minimum days").value).toBe("7"));

    fireEvent.click(screen.getByRole("button", { name: /save policy/i }));

    await waitFor(() =>
      expect(screen.getByText(POLICY_PINNED_MESSAGE)).toBeInTheDocument(),
    );
  });

  it("attaches a 400 to the field the backend named (400)", async () => {
    const message =
      "default_days (400) must fall within [min_days, max_days] = [7, 365]";
    mockUpdate.mockRejectedValue(apiError(400, message));
    renderCard();
    await waitFor(() => expect(daysInput("Minimum days").value).toBe("7"));

    fireEvent.click(screen.getByRole("button", { name: /save policy/i }));

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    // Field-level, not a card-level banner.
    expect(screen.queryByText("Policy not saved")).toBeNull();
    expect(daysInput("Default days")).toHaveAttribute("aria-invalid", "true");
  });

  it("falls back to a card-level error when the 400 names no field", async () => {
    mockUpdate.mockRejectedValue(apiError(400, "policy is not acceptable"));
    renderCard();
    await waitFor(() => expect(daysInput("Minimum days").value).toBe("7"));

    fireEvent.click(screen.getByRole("button", { name: /save policy/i }));

    await waitFor(() =>
      expect(screen.getByText("Policy not saved")).toBeInTheDocument(),
    );
    expect(screen.getByText("policy is not acceptable")).toBeInTheDocument();
  });
});

describe("TokenExpiryPolicyCard — read failures", () => {
  it("degrades to an unavailable alert on an older backend", async () => {
    mockGet.mockRejectedValue(new ApiError(404, ""));
    renderCard();

    await waitFor(() =>
      expect(screen.getByText("Policy unavailable")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /save policy/i })).toBeNull();
  });

  it("shows a loading placeholder before the read resolves", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderCard();

    expect(screen.getByTestId("token-policy-loading")).toBeInTheDocument();
  });
});
