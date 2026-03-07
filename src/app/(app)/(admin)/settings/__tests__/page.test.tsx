// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { getHealth: vi.fn() },
}));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return { Server: icon, HardDrive: icon, Lock: icon, Info: icon };
});

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({ value, ...props }: any) => <input value={value} readOnly {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import SettingsPage from "../page";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
    delete process.env.NEXT_PUBLIC_GIT_SHA;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0";
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  it("shows access denied for non-admin users", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: false } });

    render(<SettingsPage />);

    expect(screen.getByText("Access Denied")).toBeDefined();
  });

  it("shows server version from health data", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: { version: "1.1.0-rc.5" } });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const serverInput = inputs.find((i) => i.value.includes("1.1.0-rc.5"));
    expect(serverInput).toBeDefined();
  });

  it("shows server commit hash when dirty", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({
      data: { version: "1.1.0-rc.5", dirty: true, commit: "abc1234567890def" },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const serverInput = inputs.find((i) => i.value.includes("(abc1234)"));
    expect(serverInput).toBeDefined();
    expect(serverInput!.value).toBe("1.1.0-rc.5 (abc1234)");
  });

  it("hides server commit hash when not dirty", () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({
      data: { version: "1.1.0-rc.5", dirty: false, commit: "abc1234567890def" },
    });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const serverInput = inputs.find((i) => i.value === "1.1.0-rc.5");
    expect(serverInput).toBeDefined();
  });

  it("shows web version with git SHA for prerelease", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0-rc.8";
    process.env.NEXT_PUBLIC_GIT_SHA = "cf1b0d2abc1234567890";
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const webInput = inputs.find((i) => i.value.includes("(cf1b0d2)"));
    expect(webInput).toBeDefined();
    expect(webInput!.value).toBe("1.1.0-rc.8 (cf1b0d2)");
  });

  it("shows plain web version for stable release", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0";
    process.env.NEXT_PUBLIC_GIT_SHA = "cf1b0d2abc1234567890";
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const webInput = inputs.find((i) => i.value === "1.1.0");
    expect(webInput).toBeDefined();
  });

  it("shows plain web version when SHA is unknown", () => {
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0-rc.8";
    process.env.NEXT_PUBLIC_GIT_SHA = "unknown";
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockReturnValue({ data: undefined });

    render(<SettingsPage />);

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const webInput = inputs.find((i) => i.value === "1.1.0-rc.8");
    expect(webInput).toBeDefined();
  });
});
