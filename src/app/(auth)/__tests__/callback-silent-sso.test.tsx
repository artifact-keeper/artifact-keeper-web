// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks — the callback page's dependencies, silent-SSO helpers included so
// each test can pick top-level vs in-iframe behaviour.
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
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}));

vi.mock("@/lib/sdk-client", () => ({
  CSRF_HEADER_NAME: "x-ak-csrf",
  CSRF_HEADER_VALUE: "1",
}));

const mockMarkAttempted = vi.fn();
const mockClearAttempt = vi.fn();
const mockPostResult = vi.fn();
const mockIsInIframe = vi.fn();

vi.mock("@/lib/silent-sso", () => ({
  markSilentSsoAttempted: () => mockMarkAttempted(),
  clearSilentSsoAttempt: () => mockClearAttempt(),
  postSilentSsoResult: (o: string) => mockPostResult(o),
  isInIframe: () => mockIsInIframe(),
}));

import SsoCallbackPage from "../callback/page";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsInIframe.mockReturnValue(false);
  mockSearch = new URLSearchParams();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("callback page — silent_denied (anonymous stays anonymous)", () => {
  it("top-level: records the attempt and returns to the app with NO error UI", async () => {
    mockSearch = new URLSearchParams("silent_denied=1");
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockMarkAttempted).toHaveBeenCalled();
    expect(screen.queryByText("SSO Login Failed")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("in the probe iframe: posts 'denied' to the parent and stops", async () => {
    mockIsInIframe.mockReturnValue(true);
    mockSearch = new URLSearchParams("silent_denied=1");
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockPostResult).toHaveBeenCalledWith("denied"));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("SSO Login Failed")).not.toBeInTheDocument();
  });
});

describe("callback page — code exchange", () => {
  it("top-level success: clears the silent-SSO guard, refreshes, navigates home", async () => {
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(mockClearAttempt).toHaveBeenCalled();
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it("iframe success: posts 'success' and leaves navigation to the parent", async () => {
    mockIsInIframe.mockReturnValue(true);
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockPostResult).toHaveBeenCalledWith("success"));
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  it("iframe exchange failure: posts 'error' so the initiator settles", async () => {
    mockIsInIframe.mockReturnValue(true);
    mockSearch = new URLSearchParams("code=xyz");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_code" }),
    });
    render(<SsoCallbackPage />);

    await waitFor(() => expect(mockPostResult).toHaveBeenCalledWith("error"));
    // The probe iframe is hidden, so whatever it renders is invisible; the
    // contract is the message, plus never navigating the (top-level) router.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  it("top-level exchange failure: keeps the pre-existing error card", async () => {
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
  });
});

describe("callback page — IdP error param", () => {
  it("top-level: renders the error card (pre-existing behaviour)", async () => {
    mockSearch = new URLSearchParams("error=access_denied");
    render(<SsoCallbackPage />);
    await waitFor(() =>
      expect(screen.getByText("SSO Login Failed")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Access was denied by the identity provider."),
    ).toBeInTheDocument();
  });

  it("iframe: posts 'error' so the initiator settles instead of timing out", async () => {
    mockIsInIframe.mockReturnValue(true);
    mockSearch = new URLSearchParams("error=access_denied");
    render(<SsoCallbackPage />);
    await waitFor(() => expect(mockPostResult).toHaveBeenCalledWith("error"));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
