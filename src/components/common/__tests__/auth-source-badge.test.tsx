// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className, ...props }: any) => (
    <span className={className} {...props}>
      {children}
    </span>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

import {
  AuthSourceBadge,
  getAuthProviderLabel,
} from "../auth-source-badge";

describe("AuthSourceBadge", () => {
  afterEach(() => cleanup());
  it("renders 'Local' when no provider is given", () => {
    render(<AuthSourceBadge />);
    const badge = screen.getByTestId("auth-source-badge");
    expect(badge).toHaveTextContent("Local");
  });

  it("renders 'Local' for provider='local'", () => {
    render(<AuthSourceBadge provider="local" />);
    expect(screen.getByTestId("auth-source-badge")).toHaveTextContent("Local");
  });

  it("renders 'LDAP' for provider='ldap'", () => {
    render(<AuthSourceBadge provider="ldap" />);
    expect(screen.getByTestId("auth-source-badge")).toHaveTextContent("LDAP");
  });

  it("renders 'OIDC' for provider='oidc'", () => {
    render(<AuthSourceBadge provider="oidc" />);
    expect(screen.getByTestId("auth-source-badge")).toHaveTextContent("OIDC");
  });

  it("renders 'SAML' for provider='saml'", () => {
    render(<AuthSourceBadge provider="saml" />);
    expect(screen.getByTestId("auth-source-badge")).toHaveTextContent("SAML");
  });

  it("handles uppercase provider values", () => {
    render(<AuthSourceBadge provider="LDAP" />);
    expect(screen.getByTestId("auth-source-badge")).toHaveTextContent("LDAP");
  });

  it("handles mixed-case provider values", () => {
    render(<AuthSourceBadge provider="Oidc" />);
    expect(screen.getByTestId("auth-source-badge")).toHaveTextContent("OIDC");
  });

  it("capitalizes unknown provider values", () => {
    render(<AuthSourceBadge provider="github" />);
    expect(screen.getByTestId("auth-source-badge")).toHaveTextContent("Github");
  });

  it("applies slate color class for local provider", () => {
    render(<AuthSourceBadge provider="local" />);
    const badge = screen.getByTestId("auth-source-badge");
    expect(badge.className).toContain("slate");
  });

  it("applies sky color class for ldap provider", () => {
    render(<AuthSourceBadge provider="ldap" />);
    const badge = screen.getByTestId("auth-source-badge");
    expect(badge.className).toContain("sky");
  });

  it("applies violet color class for oidc provider", () => {
    render(<AuthSourceBadge provider="oidc" />);
    const badge = screen.getByTestId("auth-source-badge");
    expect(badge.className).toContain("violet");
  });

  it("applies amber color class for saml provider", () => {
    render(<AuthSourceBadge provider="saml" />);
    const badge = screen.getByTestId("auth-source-badge");
    expect(badge.className).toContain("amber");
  });

  it("applies secondary style for unknown provider", () => {
    render(<AuthSourceBadge provider="unknown_provider" />);
    const badge = screen.getByTestId("auth-source-badge");
    expect(badge.className).toContain("secondary");
  });

  it("applies custom className", () => {
    render(<AuthSourceBadge provider="local" className="my-custom-class" />);
    const badge = screen.getByTestId("auth-source-badge");
    expect(badge.className).toContain("my-custom-class");
  });

  it("renders with data-testid attribute", () => {
    render(<AuthSourceBadge provider="local" />);
    expect(screen.getByTestId("auth-source-badge")).toBeInTheDocument();
  });
});

describe("getAuthProviderLabel", () => {
  it("returns 'Local' when provider is undefined", () => {
    expect(getAuthProviderLabel(undefined)).toBe("Local");
  });

  it("returns 'Local' for 'local'", () => {
    expect(getAuthProviderLabel("local")).toBe("Local");
  });

  it("returns 'LDAP' for 'ldap'", () => {
    expect(getAuthProviderLabel("ldap")).toBe("LDAP");
  });

  it("returns 'OIDC' for 'oidc'", () => {
    expect(getAuthProviderLabel("oidc")).toBe("OIDC");
  });

  it("returns 'SAML' for 'saml'", () => {
    expect(getAuthProviderLabel("saml")).toBe("SAML");
  });

  it("returns 'LDAP' for uppercase 'LDAP'", () => {
    expect(getAuthProviderLabel("LDAP")).toBe("LDAP");
  });

  it("capitalizes unknown provider strings", () => {
    expect(getAuthProviderLabel("keycloak")).toBe("Keycloak");
  });

  it("returns 'Local' for empty string", () => {
    expect(getAuthProviderLabel("")).toBe("Local");
  });
});
