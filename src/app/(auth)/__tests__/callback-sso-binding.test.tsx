// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import React from "react";

// artifact-keeper#5486: the backend redeems an SSO exchange code only in the
// browser that started the sign-in, via an HttpOnly cookie the exchange
// request has to carry.

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockSearch = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => mockSearch,
}));

vi.mock("lucide-react", () => ({
  Loader2: (props: object) => <span data-testid="spinner" {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<object>) => (
    <button {...props}>{children}</button>
  ),
}));

const mockRefreshUser = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser, beginTotpChallenge: vi.fn() }),
}));

vi.mock("@/lib/sdk-client", () => ({
  CSRF_HEADER_NAME: "x-ak-csrf",
  CSRF_HEADER_VALUE: "1",
}));

vi.mock("@/lib/silent-sso", () => ({
  markSilentSsoAttempted: vi.fn(),
  clearSilentSsoAttempt: vi.fn(),
  consumeSilentSsoReturnTo: () => null,
}));

import SsoCallbackPage from "../callback/page";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearch = new URLSearchParams("code=abc123");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("callback page — exchange bound to the starting browser (artifact-keeper#5486)", () => {
  it("sends the exchange with credentials: include, so the binding cookie goes along", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { access_token: "t" }));
    render(<SsoCallbackPage />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/auth/sso/exchange");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
  });

  it("says the sign-in was finished in another browser and does not sign in", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, {
        code: "AUTH_ERROR",
        message:
          "This sign-in was not started in this browser (SSO browser binding missing or mismatched). Start the sign-in again.",
      })
    );
    render(<SsoCallbackPage />);

    expect(
      await screen.findByText(/finished in a different browser than the one that started it/)
    ).toBeInTheDocument();
    expect(screen.getByText("SSO Login Failed")).toBeInTheDocument();
    expect(mockRefreshUser).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("keeps the generic message for any other 401", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { code: "AUTH_ERROR", message: "Invalid or expired exchange code" })
    );
    render(<SsoCallbackPage />);

    expect(await screen.findByText("Authentication failed. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/different browser/)).not.toBeInTheDocument();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });
});
