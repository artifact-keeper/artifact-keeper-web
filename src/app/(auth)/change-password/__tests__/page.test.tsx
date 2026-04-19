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
// Mocks (must be before component import)
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockChangePassword = vi.fn();
const mockLogout = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    changePassword: mockChangePassword,
    logout: mockLogout,
    setupRequired: false,
  }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}));

vi.mock("@hookform/resolvers/zod", () => ({
  zodResolver: () => async (values: any) => ({ values, errors: {} }),
}));

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    Lock: stub("Lock"),
    Shield: stub("Shield"),
    Loader2: stub("Loader2"),
    Info: stub("Info"),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
}));

// The shadcn Form component is a FormProvider wrapper.
// The real <form> element with onSubmit is a direct child in the component.
// We just render children so the nested <form> works normally.
vi.mock("@/components/ui/form", () => ({
  Form: ({ children }: any) => <div data-testid="form-provider">{children}</div>,
  FormControl: ({ children }: any) => <div>{children}</div>,
  FormField: ({ render, name }: any) => {
    const field = {
      value: "",
      onChange: vi.fn(),
      onBlur: vi.fn(),
      name,
      ref: vi.fn(),
    };
    return <div data-testid={`form-field-${name}`}>{render({ field })}</div>;
  },
  FormItem: ({ children }: any) => <div>{children}</div>,
  FormLabel: ({ children }: any) => <label>{children}</label>,
  FormMessage: () => <span data-testid="form-message" />,
}));

vi.mock("@/components/common/password-policy-hint", () => ({
  PasswordPolicyHint: () => <div data-testid="password-policy-hint" />,
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import ChangePasswordPage from "../page";
import { PASSWORD_REUSE_MESSAGE } from "@/lib/error-utils";

// ---------------------------------------------------------------------------
// Helper: find and submit the form
// ---------------------------------------------------------------------------

function submitForm() {
  const form = document.querySelector("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChangePasswordPage", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockChangePassword.mockReset();
    mockLogout.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the heading and form fields", () => {
    render(<ChangePasswordPage />);
    const headings = screen.getAllByText("Change Password");
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Current Password")).toBeInTheDocument();
    expect(screen.getByText("New Password")).toBeInTheDocument();
    expect(screen.getByText("Confirm New Password")).toBeInTheDocument();
  });

  it("renders the password policy hint", () => {
    render(<ChangePasswordPage />);
    expect(screen.getByTestId("password-policy-hint")).toBeInTheDocument();
  });

  it("shows success toast and redirects on successful password change", async () => {
    mockChangePassword.mockResolvedValue(undefined);
    render(<ChangePasswordPage />);

    submitForm();

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Password changed successfully!"
      );
    });
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("shows password reuse toast on password history error", async () => {
    mockChangePassword.mockRejectedValue({
      error: "Password matches password history",
    });

    render(<ChangePasswordPage />);
    submitForm();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(PASSWORD_REUSE_MESSAGE);
    });

    // Should not redirect
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows password reuse toast for body.message error shape", async () => {
    mockChangePassword.mockRejectedValue({
      body: { message: "Password was previously used" },
    });

    render(<ChangePasswordPage />);
    submitForm();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(PASSWORD_REUSE_MESSAGE);
    });
  });

  it("shows generic error toast for non-reuse errors", async () => {
    mockChangePassword.mockRejectedValue(
      new Error("Invalid current password")
    );

    render(<ChangePasswordPage />);
    submitForm();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Invalid current password");
    });
  });

  it("does not show reuse message for unrelated errors", async () => {
    mockChangePassword.mockRejectedValue(
      new Error("Network error")
    );

    render(<ChangePasswordPage />);
    submitForm();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Network error");
    });
    expect(mockToastError).not.toHaveBeenCalledWith(PASSWORD_REUSE_MESSAGE);
  });

  it("falls back to default message for unknown error shapes", async () => {
    mockChangePassword.mockRejectedValue(42);

    render(<ChangePasswordPage />);
    submitForm();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to change password.");
    });
  });

  it("calls logout and redirects when logout button is clicked", async () => {
    mockLogout.mockResolvedValue(undefined);
    render(<ChangePasswordPage />);

    const logoutBtn = screen.getByText("Logout instead");
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
