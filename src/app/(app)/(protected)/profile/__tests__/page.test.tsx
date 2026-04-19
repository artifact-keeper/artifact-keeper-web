// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mock fns so they can be referenced in vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockToastSuccess,
  mockToastError,
  mockChangePassword,
  mockRefreshUser,
  mockUseMutation,
  mockProfileUpdate,
} = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockChangePassword: vi.fn(),
  mockRefreshUser: vi.fn(),
  mockUseMutation: vi.fn(),
  mockProfileUpdate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      username: "testuser",
      email: "test@example.com",
      display_name: "Test User",
      is_admin: false,
      totp_enabled: false,
    },
    refreshUser: mockRefreshUser,
    changePassword: mockChangePassword,
  }),
}));

vi.mock("@/lib/api/profile", () => ({
  profileApi: { update: mockProfileUpdate },
}));

vi.mock("@/lib/api/totp", () => ({
  totpApi: { setup: vi.fn(), enable: vi.fn(), disable: vi.fn() },
}));

vi.mock("react-qr-code", () => ({
  default: () => <div data-testid="qr-code" />,
}));

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    User: stub("User"),
    Key: stub("Key"),
    Shield: stub("Shield"),
    Lock: stub("Lock"),
    AlertTriangle: stub("AlertTriangle"),
    Info: stub("Info"),
    ExternalLink: stub("ExternalLink"),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild: _asChild, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
}));

vi.mock("@/components/common/copy-button", () => ({
  CopyButton: () => <button>Copy</button>,
}));

vi.mock("@/components/common/password-policy-hint", () => ({
  PasswordPolicyHint: () => <div data-testid="password-policy-hint" />,
}));

mockUseMutation.mockImplementation((opts: any) => {
  const mutate = vi.fn(async (...args: any[]) => {
    try {
      await opts.mutationFn(...args);
      opts.onSuccess?.();
    } catch (err: unknown) {
      opts.onError?.(err);
    }
  });
  const result = { mutate, isPending: false };
  return result;
});

vi.mock("@tanstack/react-query", () => ({
  useMutation: (opts: any) => mockUseMutation(opts),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import ProfilePage from "../page";
import { PASSWORD_REUSE_MESSAGE } from "@/lib/error-utils";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProfilePage", () => {
  beforeEach(() => {
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockChangePassword.mockReset();
    mockRefreshUser.mockReset();
    mockProfileUpdate.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the profile page with tabs", () => {
    render(<ProfilePage />);
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    // "Change Password" appears as both a heading and a submit button
    const changePwElements = screen.getAllByText("Change Password");
    expect(changePwElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows generic error toast for non-reuse password errors", async () => {
    mockChangePassword.mockRejectedValue(new Error("Invalid current password"));

    render(<ProfilePage />);

    // Fill in password fields
    const currentPwInput = screen.getByPlaceholderText("Enter current password");
    const newPwInput = screen.getByPlaceholderText("Enter new password");
    const confirmPwInput = screen.getByPlaceholderText("Confirm new password");

    fireEvent.change(currentPwInput, { target: { value: "oldpass123" } });
    fireEvent.change(newPwInput, { target: { value: "newpass123" } });
    fireEvent.change(confirmPwInput, { target: { value: "newpass123" } });

    // Submit password change form
    const submitBtns = screen.getAllByText("Change Password");
    // The second one is the submit button (first is the card title)
    const submitBtn = submitBtns.find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    expect(submitBtn).toBeDefined();
    fireEvent.click(submitBtn!);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Invalid current password");
    });
  });

  it("shows password reuse message for password history errors", async () => {
    mockChangePassword.mockRejectedValue({
      error: "Password matches password history",
    });

    render(<ProfilePage />);

    const currentPwInput = screen.getByPlaceholderText("Enter current password");
    const newPwInput = screen.getByPlaceholderText("Enter new password");
    const confirmPwInput = screen.getByPlaceholderText("Confirm new password");

    fireEvent.change(currentPwInput, { target: { value: "oldpass123" } });
    fireEvent.change(newPwInput, { target: { value: "newpass123" } });
    fireEvent.change(confirmPwInput, { target: { value: "newpass123" } });

    const submitBtns = screen.getAllByText("Change Password");
    const submitBtn = submitBtns.find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    fireEvent.click(submitBtn!);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(PASSWORD_REUSE_MESSAGE);
    });

    // The inline error should also be visible
    await waitFor(() => {
      const errorEl = screen.getByRole("alert");
      expect(errorEl).toHaveTextContent(PASSWORD_REUSE_MESSAGE);
    });
  });

  it("shows inline error that clears when user edits new password", async () => {
    mockChangePassword.mockRejectedValue({
      error: "Password matches password history",
    });

    render(<ProfilePage />);

    const currentPwInput = screen.getByPlaceholderText("Enter current password");
    const newPwInput = screen.getByPlaceholderText("Enter new password");
    const confirmPwInput = screen.getByPlaceholderText("Confirm new password");

    fireEvent.change(currentPwInput, { target: { value: "oldpass123" } });
    fireEvent.change(newPwInput, { target: { value: "newpass123" } });
    fireEvent.change(confirmPwInput, { target: { value: "newpass123" } });

    const submitBtns = screen.getAllByText("Change Password");
    const submitBtn = submitBtns.find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    fireEvent.click(submitBtn!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Editing the new password field should clear the inline error
    fireEvent.change(newPwInput, { target: { value: "different456" } });

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("clears fields and shows success toast on successful password change", async () => {
    mockChangePassword.mockResolvedValue(undefined);

    render(<ProfilePage />);

    const currentPwInput = screen.getByPlaceholderText("Enter current password");
    const newPwInput = screen.getByPlaceholderText("Enter new password");
    const confirmPwInput = screen.getByPlaceholderText("Confirm new password");

    fireEvent.change(currentPwInput, { target: { value: "oldpass123" } });
    fireEvent.change(newPwInput, { target: { value: "newpass123" } });
    fireEvent.change(confirmPwInput, { target: { value: "newpass123" } });

    const submitBtns = screen.getAllByText("Change Password");
    const submitBtn = submitBtns.find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    fireEvent.click(submitBtn!);

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Password changed successfully"
      );
    });
  });

  it("shows mismatch toast when passwords do not match", () => {
    render(<ProfilePage />);

    const currentPwInput = screen.getByPlaceholderText("Enter current password");
    const newPwInput = screen.getByPlaceholderText("Enter new password");
    const confirmPwInput = screen.getByPlaceholderText("Confirm new password");

    fireEvent.change(currentPwInput, { target: { value: "oldpass123" } });
    fireEvent.change(newPwInput, { target: { value: "newpass123" } });
    fireEvent.change(confirmPwInput, { target: { value: "different" } });

    const submitBtns = screen.getAllByText("Change Password");
    const submitBtn = submitBtns.find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    fireEvent.click(submitBtn!);

    expect(mockToastError).toHaveBeenCalledWith("Passwords do not match");
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("shows length toast when password is too short", () => {
    render(<ProfilePage />);

    const currentPwInput = screen.getByPlaceholderText("Enter current password");
    const newPwInput = screen.getByPlaceholderText("Enter new password");
    const confirmPwInput = screen.getByPlaceholderText("Confirm new password");

    fireEvent.change(currentPwInput, { target: { value: "oldpass123" } });
    fireEvent.change(newPwInput, { target: { value: "short" } });
    fireEvent.change(confirmPwInput, { target: { value: "short" } });

    const submitBtns = screen.getAllByText("Change Password");
    const submitBtn = submitBtns.find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    fireEvent.click(submitBtn!);

    expect(mockToastError).toHaveBeenCalledWith(
      "Password must be at least 8 characters"
    );
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("shows password reuse message for body.message error shape", async () => {
    mockChangePassword.mockRejectedValue({
      body: { message: "Password was previously used" },
    });

    render(<ProfilePage />);

    const currentPwInput = screen.getByPlaceholderText("Enter current password");
    const newPwInput = screen.getByPlaceholderText("Enter new password");
    const confirmPwInput = screen.getByPlaceholderText("Confirm new password");

    fireEvent.change(currentPwInput, { target: { value: "oldpass123" } });
    fireEvent.change(newPwInput, { target: { value: "newpass123" } });
    fireEvent.change(confirmPwInput, { target: { value: "newpass123" } });

    const submitBtns = screen.getAllByText("Change Password");
    const submitBtn = submitBtns.find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    fireEvent.click(submitBtn!);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(PASSWORD_REUSE_MESSAGE);
    });
  });
});
