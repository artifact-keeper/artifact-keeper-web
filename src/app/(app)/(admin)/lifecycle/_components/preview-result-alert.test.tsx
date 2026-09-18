// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { PolicyExecutionResult } from "@/types/lifecycle";
import { PreviewResultAlert } from "./preview-result-alert";

afterEach(() => cleanup());

// A real dry run: the backend zeroes artifacts_removed and bytes_freed and
// carries the figures in artifacts_matched / bytes_matched.
const DRY_RUN: PolicyExecutionResult = {
  policy_id: "p1",
  policy_name: "Drop old snapshots",
  dry_run: true,
  artifacts_matched: 12,
  artifacts_removed: 0,
  bytes_matched: 1572864,
  bytes_freed: 0,
  errors: [],
};

describe("PreviewResultAlert", () => {
  it("reports what the run would reclaim from bytes_matched", () => {
    render(<PreviewResultAlert result={DRY_RUN} />);

    expect(screen.getByText(/Preview: Drop old snapshots/)).toBeInTheDocument();
    expect(
      screen.getByText(/Would delete 12 artifacts and reclaim 1\.5 MB/)
    ).toBeInTheDocument();
  });

  it("does not present the dry run's zero bytes_freed as the reclaimable size", () => {
    render(<PreviewResultAlert result={DRY_RUN} />);

    expect(screen.queryByText(/0 B/)).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing has been deleted/)).toBeInTheDocument();
  });

  it("omits the size when the backend predates bytes_matched", () => {
    render(
      <PreviewResultAlert result={{ ...DRY_RUN, bytes_matched: null }} />
    );

    expect(screen.getByText(/Would delete 12 artifacts\./)).toBeInTheDocument();
    expect(screen.queryByText(/reclaim/)).not.toBeInTheDocument();
  });

  it("uses the singular noun for a single artifact", () => {
    render(
      <PreviewResultAlert
        result={{ ...DRY_RUN, artifacts_matched: 1, bytes_matched: 1024 }}
      />
    );

    expect(
      screen.getByText(/Would delete 1 artifact and reclaim 1 KB/)
    ).toBeInTheDocument();
  });

  it("flags errors reported by the dry run", () => {
    render(
      <PreviewResultAlert
        result={{ ...DRY_RUN, errors: ["repository locked"] }}
      />
    );

    expect(screen.getByText(/1 error\(s\)\./)).toBeInTheDocument();
  });
});
