// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ArtifactAttestationSection } from "./artifact-attestation-section";
import { CondaPackageSection } from "./conda-package-section";

afterEach(cleanup);

const CHANNEL = { repoKey: "conda-internal", path: "noarch/acme-report-1.0.0-py_0.conda" };

describe("ArtifactAttestationSection", () => {
  it("shows a verified key-based attestation with links to the sidecar and the bundle", () => {
    render(
      <ArtifactAttestationSection
        channel={CHANNEL}
        metadata={{
          attestation: { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" },
          attestation_verification: {
            verified: true,
            method: "sigstore-key",
            identity: "ci",
            issuer: "key:53ff3ea8b0f33847",
            key_fingerprint: "SHA256:k3y",
            verified_at: "2026-10-06T10:00:00Z",
          },
        }}
      />,
    );
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("SHA256:k3y")).toBeInTheDocument();
    // Key-based: the key's name is labelled as such and the synthetic
    // `key:<id>` issuer is not shown as an OIDC issuer.
    expect(screen.getByText("Key name")).toBeInTheDocument();
    expect(screen.queryByText("Issuer")).toBeNull();
    expect(screen.getByText(/configured key/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\.sigs sidecar/ })).toHaveAttribute(
      "href",
      "/conda/conda-internal/noarch/acme-report-1.0.0-py_0.conda.sigs",
    );
    expect(screen.getByRole("link", { name: /Sigstore bundle/ })).toHaveAttribute(
      "href",
      "/conda/conda-internal/noarch/acme-report-1.0.0-py_0.conda/attestation",
    );
  });

  it("says so when there is no attestation, with no file links", () => {
    render(<ArtifactAttestationSection channel={CHANNEL} metadata={{ license: "MIT" }} />);
    expect(screen.getByText("No attestation")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows the reason for a failed verification", () => {
    render(
      <ArtifactAttestationSection
        channel={CHANNEL}
        metadata={{
          attestation: {},
          attestation_verification: { state: "failed", error: "signature does not match key" },
        }}
      />,
    );
    expect(screen.getByText("Verification failed")).toBeInTheDocument();
    expect(screen.getByText("signature does not match key")).toBeInTheDocument();
  });
});

describe("CondaPackageSection", () => {
  it("lists subdir, build, license, depends and uploader", () => {
    render(
      <CondaPackageSection
        path={CHANNEL.path}
        uploadedBy="ci-publisher"
        metadata={{ license: "Apache-2.0", build_number: 0, depends: ["acme-core >=0.1", "pandas"] }}
      />,
    );
    expect(screen.getByText("noarch")).toBeInTheDocument();
    expect(screen.getByText("Apache-2.0")).toBeInTheDocument();
    expect(screen.getByText("acme-core >=0.1")).toBeInTheDocument();
    expect(screen.getByText("ci-publisher")).toBeInTheDocument();
  });

  it("shows a verified publisher badge distinctly from a declared maintainer (#921)", () => {
    const { unmount } = render(
      <CondaPackageSection
        path={CHANNEL.path}
        metadata={{ attestation: {}, attestation_verification: { state: "verified", owner: "acme" } }}
      />,
    );
    expect(screen.getByTestId("publisher-badge")).toHaveTextContent("Verified publisher: acme");
    unmount();
    render(<CondaPackageSection path={CHANNEL.path} metadata={{ about: { maintainer: "Acme" } }} />);
    expect(screen.getByTestId("publisher-badge")).toHaveTextContent("Declared maintainer: Acme (not verified)");
  });
});

