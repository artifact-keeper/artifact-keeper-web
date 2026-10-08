// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockGet = vi.fn();
vi.mock("@/lib/api/attestation-policy", () => ({
  attestationPolicyApi: { get: () => mockGet() },
}));

import { AttestationPolicyCard } from "./attestation-policy-card";
import { ApiError } from "@/lib/api/fetch";

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AttestationPolicyCard />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockGet.mockReset();
});

describe("AttestationPolicyCard", () => {
  it("shows the requirement, trusted keys, issuers and identities", async () => {
    mockGet.mockResolvedValue({
      require_verified: true,
      issuers: ["https://token.actions.githubusercontent.com"],
      identities: [],
      keys: [{ id: "k1", name: "acme-ci", fingerprint: "SHA256:abc", algorithm: "ecdsa-p256" }],
    });
    renderCard();
    expect(await screen.findByText("Verified attestation required")).toBeInTheDocument();
    expect(screen.getByText("acme-ci")).toBeInTheDocument();
    expect(screen.getByText("SHA256:abc")).toBeInTheDocument();
    expect(screen.getByText("https://token.actions.githubusercontent.com")).toBeInTheDocument();
    expect(screen.getByText("Any identity from a trusted issuer")).toBeInTheDocument();
  });

  it("explains a backend without the endpoint", async () => {
    mockGet.mockRejectedValue(new ApiError(404, ""));
    renderCard();
    expect(await screen.findByText(/does not report an attestation trust policy/)).toBeInTheDocument();
  });
});
