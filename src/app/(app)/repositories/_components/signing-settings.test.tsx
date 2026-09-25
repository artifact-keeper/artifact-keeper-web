// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Repository } from "@/types";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => cleanup());

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockGetRepoConfig = vi.fn();
const mockUpdateRepoConfig = vi.fn();
const mockListKeys = vi.fn();
const mockCreateKey = vi.fn();
const mockGetTrustAttestation = vi.fn();

vi.mock("@/lib/api/signing", () => ({
  default: {
    getRepoConfig: (...a: unknown[]) => mockGetRepoConfig(...a),
    updateRepoConfig: (...a: unknown[]) => mockUpdateRepoConfig(...a),
    listKeys: (...a: unknown[]) => mockListKeys(...a),
    createKey: (...a: unknown[]) => mockCreateKey(...a),
    getTrustAttestation: (...a: unknown[]) => mockGetTrustAttestation(...a),
  },
}));

vi.mock("@/lib/error-utils", async () => {
  const { toast } = await import("sonner");
  return {
    mutationErrorToast: (label: string) => () => toast.error(label),
  };
});

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="select-root" data-value={value}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ value?: string; onValueChange?: (v: string) => void }>, {
              value,
              onValueChange,
            })
          : child,
      )}
    </div>
  ),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <button type="button" id={id}>{children}</button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children, onValueChange, value }: { children: React.ReactNode; onValueChange?: (v: string) => void; value?: string }) => (
    <div>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ onSelect?: () => void }>, {
              onSelect: () => onValueChange?.((child.props as { value: string }).value),
            })
          : child,
      )}
      <span data-testid="select-value">{value}</span>
    </div>
  ),
  SelectItem: ({
    value,
    children,
    onSelect,
  }: {
    value: string;
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" data-value={value} onClick={onSelect}>
      {children}
    </button>
  ),
}));

import { SigningSettings } from "./signing-settings";

const DEBIAN_REPO: Repository = {
  id: "repo-1",
  key: "ubuntu-noble",
  name: "Ubuntu Noble",
  format: "debian",
  repo_type: "local",
  is_public: false,
  storage_used_bytes: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderPanel(repo: Repository = DEBIAN_REPO) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SigningSettings repository={repo} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRepoConfig.mockResolvedValue({
    repository_id: "repo-1",
    signing_key_id: null,
    sign_metadata: false,
    sign_packages: false,
    require_signatures: false,
    key: null,
  });
  mockListKeys.mockResolvedValue([
    {
      id: "k-global",
      name: "global-key",
      key_type: "gpg",
      algorithm: "ed25519",
      fingerprint: "AAA",
      key_id: null,
      public_key_pem: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      is_active: true,
      uid_name: null,
      uid_email: null,
      expires_at: null,
      last_used_at: null,
      repository_id: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ]);
  mockGetTrustAttestation.mockResolvedValue(null);
  mockUpdateRepoConfig.mockResolvedValue({
    repository_id: "repo-1",
    signing_key_id: "k-global",
    sign_metadata: true,
    sign_packages: false,
    require_signatures: false,
    key: null,
  });
});

describe("SigningSettings", () => {
  it("shows unsupported message for npm repositories", async () => {
    renderPanel({ ...DEBIAN_REPO, format: "npm" });
    expect(await screen.findByText(/Cryptographic signing is available/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Signing key/i)).not.toBeInTheDocument();
  });

  it("renders signing controls for debian repositories", async () => {
    renderPanel();
    expect(await screen.findByLabelText(/Signing key/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save Signing Configuration/i })).toBeDisabled();
  });

  it("saves signing configuration when changed", async () => {
    renderPanel();
    await screen.findByLabelText(/Signing key/i);

    fireEvent.click(screen.getByRole("button", { name: /global-key/i }));
    fireEvent.click(screen.getByRole("switch", { name: /Sign metadata/i }));

    const save = screen.getByRole("button", { name: /Save Signing Configuration/i });
    await waitFor(() => expect(save).not.toBeDisabled());
    await userEvent.click(save);

    await waitFor(() =>
      expect(mockUpdateRepoConfig).toHaveBeenCalledWith("repo-1", {
        signing_key_id: "k-global",
        sign_metadata: true,
        sign_packages: false,
        require_signatures: false,
      }),
    );
  });

  it("warns and blocks metadata signing when key type is incompatible", async () => {
    // RPM requires a GPG key; selecting an RSA key must warn and disable the
    // metadata-signing switch so an unverifiable signature can't be produced.
    mockListKeys.mockResolvedValue([
      {
        id: "k-rsa",
        name: "rsa-key",
        key_type: "rsa",
        algorithm: "rsa4096",
        fingerprint: null,
        key_id: "1234",
        public_key_pem: "-----BEGIN PUBLIC KEY-----",
        is_active: true,
        uid_name: null,
        uid_email: null,
        expires_at: null,
        last_used_at: null,
        repository_id: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    renderPanel({ ...DEBIAN_REPO, format: "rpm", key: "rpm-el9", name: "RPM EL9" });
    await screen.findByLabelText(/Signing key/i);

    fireEvent.click(screen.getByRole("button", { name: /rsa-key/i }));

    expect(await screen.findByText(/Incompatible key type/i)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Sign metadata/i })).toBeDisabled();
  });
});
