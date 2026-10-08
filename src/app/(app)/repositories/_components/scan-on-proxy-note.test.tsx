// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ScanOnProxyNote, SCAN_ON_PROXY_DOC_URL } from "./scan-on-proxy-note";

afterEach(cleanup);

describe("ScanOnProxyNote", () => {
  it.each([true, false])("links the coverage doc (enforced=%s)", (enforced) => {
    render(<ScanOnProxyNote id="n" enforced={enforced} formatLabel="MAVEN" />);
    expect(screen.getByRole("link", { name: "Which formats are covered?" })).toHaveAttribute(
      "href",
      SCAN_ON_PROXY_DOC_URL,
    );
  });
});
