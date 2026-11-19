// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks — the callback page's dependencies, silent-SSO helpers included so
// each test controls the guard/return-to behaviour.
// ---------------------------------------------------------------------------

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
const mockBeginTotpChallenge = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    refreshUser: mockRefreshUser,
    beginTotpChallenge: mockBeginTotpChallenge,
  }),
}));

vi.mock("@/lib/sdk-client", () => ({
  CSRF_HEADER_NAME: "x-ak-csrf",
  CSRF_HEADER_VALUE: "1",
}));

const mockMarkAttempted = vi.fn();
const mockClearAttempt = vi.fn();
const mockConsumeReturnTo = vi.fn();

vi.mock("@/lib/silent-sso", () => ({
  markSilentSsoAttempted: () => mockMarkAttempted(),
  clearSilentSsoAttempt: () => mockClearAttempt(),
  consumeSilentSsoReturnTo: () => mockConsumeReturnTo(),
}));

import SsoCallbackPage from "../callback/page";

beforeEach(() => {
  vi.clearAllMocks();
  mockSearch = new URLSearchParams();
  mockConsumeReturnTo.mockReturnValue(null);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("callback page — silent_denied (anonymous stays anonymous)", () => {
  it("records the attempt and returns to the app root with NO error UI", async () => {
    mockSearch = new URLSearchParams("silent_denied=1");
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockMarkAttempted).toHaveBeenCalled();
    expect(screen.queryByText("SSO Login Failed")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the visitor to the page the silent attempt started from", async () => {
    mockConsumeReturnTo.mockReturnValue("/packages/pypi/requests");
    mockSearch = new URLSearchParams("silent_denied=1");
    render(<SsoCallbackPage />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/packages/pypi/requests"),
    );
    expect(screen.queryByText("SSO Login Failed")).not.toBeInTheDocument();
  });
});

describe("callback page — code exchange", () => {
  it("success: clears the silent-SSO guard, refreshes, returns to the stored page", async () => {
    mockConsumeReturnTo.mockReturnValue("/repositories");
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/repositories"));
    expect(mockClearAttempt).toHaveBeenCalled();
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it("success with no stored return path (explicit login): lands on / as before", async () => {
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockClearAttempt).toHaveBeenCalled();
  });

  it("exchange failure: keeps the pre-existing error card and does not clear the guard", async () => {
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_code" }),
    });
    render(<SsoCallbackPage />);

    await waitFor(() =>
      expect(screen.getByText("SSO Login Failed")).toBeInTheDocument(),
    );
    expect(mockClearAttempt).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("callback page — IdP error param", () => {
  it("renders the error card (pre-existing behaviour, silent family excluded server-side)", async () => {
    mockSearch = new URLSearchParams("error=access_denied");
    render(<SsoCallbackPage />);
    await waitFor(() =>
      expect(screen.getByText("SSO Login Failed")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Access was denied by the identity provider."),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("callback page — TOTP-enrolled account (artifact-keeper#5484)", () => {
  // What POST /auth/sso/exchange answers for an OIDC or SAML sign-in by an
  // account with TOTP enrolled: no cookies, empty tokens, a pending token.
  const challenge = {
    access_token: "",
    refresh_token: "",
    token_type: "Bearer",
    expires_in: 0,
    totp_required: true,
    totp_token: "pending.jwt",
  };

  it("explicit sign-in: starts the TOTP step on /login and does not refresh the user", async () => {
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => challenge,
    });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    expect(mockBeginTotpChallenge).toHaveBeenCalledWith("pending.jwt");
    expect(mockRefreshUser).not.toHaveBeenCalled();
    // Not signed in yet: the silent-SSO guard is left alone until the TOTP
    // step succeeds (loadUser clears it then).
    expect(mockClearAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText("SSO Login Failed")).not.toBeInTheDocument();
  });

  it("silent probe: stays anonymous and returns to the page, without prompting", async () => {
    mockConsumeReturnTo.mockReturnValue("/packages/pypi/requests");
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => challenge,
    });
    render(<SsoCallbackPage />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/packages/pypi/requests"),
    );
    expect(mockMarkAttempted).toHaveBeenCalled();
    expect(mockBeginTotpChallenge).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
    expect(mockClearAttempt).not.toHaveBeenCalled();
    expect(screen.queryByText("SSO Login Failed")).not.toBeInTheDocument();
  });

  it("no TOTP: a session body signs in as before", async () => {
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "AT",
        refresh_token: "RT",
        token_type: "Bearer",
        expires_in: 1800,
      }),
    });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(mockClearAttempt).toHaveBeenCalled();
    expect(mockBeginTotpChallenge).not.toHaveBeenCalled();
  });

  it("an unreadable 200 body keeps the session path", async () => {
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(mockBeginTotpChallenge).not.toHaveBeenCalled();
  });
});
