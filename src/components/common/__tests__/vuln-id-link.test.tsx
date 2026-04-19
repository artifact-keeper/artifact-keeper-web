// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  ExternalLink: (props: Record<string, unknown>) => (
    <span data-testid="icon-external-link" {...props} />
  ),
}));

import { VulnIdLink } from "../vuln-id-link";

describe("VulnIdLink", () => {
  afterEach(cleanup);

  // ---- CVE identifiers ----

  it("renders a link to NVD for CVE IDs", () => {
    render(<VulnIdLink id="CVE-2024-1234" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://nvd.nist.gov/vuln/detail/CVE-2024-1234"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("CVE-2024-1234");
  });

  it("shows auto-detected CVE source label", () => {
    render(<VulnIdLink id="CVE-2024-1234" />);

    expect(screen.getByText("CVE")).toBeInTheDocument();
  });

  // ---- GHSA identifiers ----

  it("renders a link to GitHub advisories for GHSA IDs", () => {
    render(<VulnIdLink id="GHSA-abcd-efgh-ijkl" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/advisories/GHSA-abcd-efgh-ijkl"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("GHSA-abcd-efgh-ijkl");
  });

  it("shows auto-detected GHSA source label", () => {
    render(<VulnIdLink id="GHSA-abcd-efgh-ijkl" />);

    expect(screen.getByText("GHSA")).toBeInTheDocument();
  });

  // ---- Unknown identifiers ----

  it("renders plain text for unknown ID formats", () => {
    render(<VulnIdLink id="PYSEC-2024-42" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("PYSEC-2024-42")).toBeInTheDocument();
  });

  it("does not show a source label for unknown ID formats", () => {
    render(<VulnIdLink id="PYSEC-2024-42" />);

    // vulnIdType returns "Advisory" for unknown, and the component
    // suppresses the label when type is "Advisory" and no source is given
    expect(screen.queryByText("Advisory")).not.toBeInTheDocument();
  });

  // ---- source prop override ----

  it("source prop overrides auto-detected source label", () => {
    render(<VulnIdLink id="CVE-2024-1234" source="Trivy" />);

    expect(screen.getByText("Trivy")).toBeInTheDocument();
    expect(screen.queryByText("CVE")).not.toBeInTheDocument();
  });

  it("source prop adds a label even for unknown identifier types", () => {
    render(<VulnIdLink id="PYSEC-2024-42" source="OSV" />);

    expect(screen.getByText("OSV")).toBeInTheDocument();
  });

  it("null source falls back to auto-detected label", () => {
    render(<VulnIdLink id="GHSA-abcd-efgh-ijkl" source={null} />);

    expect(screen.getByText("GHSA")).toBeInTheDocument();
  });

  // ---- click handler ----

  it("click handler calls stopPropagation on linked identifiers", () => {
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <VulnIdLink id="CVE-2024-1234" />
      </div>
    );

    const link = screen.getByRole("link");
    fireEvent.click(link);

    expect(parentClick).not.toHaveBeenCalled();
  });

  // ---- showIcon prop ----

  it("shows the external link icon when showIcon is true", () => {
    render(<VulnIdLink id="CVE-2024-1234" showIcon />);

    expect(screen.getByTestId("icon-external-link")).toBeInTheDocument();
  });

  it("hides the external link icon by default", () => {
    render(<VulnIdLink id="CVE-2024-1234" />);

    expect(screen.queryByTestId("icon-external-link")).not.toBeInTheDocument();
  });

  // ---- className prop ----

  it("applies custom className to the outer element", () => {
    const { container } = render(
      <VulnIdLink id="CVE-2024-1234" className="my-custom-class" />
    );

    expect(container.firstChild).toHaveClass("my-custom-class");
  });
});
