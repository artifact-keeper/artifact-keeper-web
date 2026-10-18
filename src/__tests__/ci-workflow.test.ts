import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guards the job timeouts in `.github/workflows/ci.yml` (#893). A job without
 * `timeout-minutes` inherits GitHub's 6-hour default, so a hang (the Unit
 * Tests job on #852 sat for more than 30 minutes before it was cancelled by
 * hand) holds a runner and blocks the PR instead of failing fast.
 *
 * Parsed as text so the test needs no YAML dependency: a job is a two-space
 * indented key under `jobs:`, and its settings are the four-space indented
 * keys that follow it.
 */
const workflow = readFileSync(
  join(__dirname, "../../.github/workflows/ci.yml"),
  "utf-8",
);

function jobTimeouts(source: string): Map<string, number | undefined> {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l === "jobs:");
  const jobs = new Map<string, number | undefined>();
  let current: string | null = null;
  for (const line of lines.slice(start + 1)) {
    const job = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (job) {
      current = job[1];
      jobs.set(current, undefined);
      continue;
    }
    const timeout = /^ {4}timeout-minutes:\s*(\d+)\s*$/.exec(line);
    if (current && timeout) jobs.set(current, Number(timeout[1]));
  }
  return jobs;
}

const timeouts = jobTimeouts(workflow);

describe("ci.yml job timeouts", () => {
  it("finds the required-check jobs", () => {
    for (const job of ["lint", "audit", "test", "build"]) {
      expect(timeouts.has(job)).toBe(true);
    }
  });

  it("bounds the Unit Tests job at 15 minutes", () => {
    expect(timeouts.get("test")).toBe(15);
  });

  it.each(["lint", "audit", "build"])(
    "bounds the %s job well under GitHub's 6-hour default",
    (job) => {
      const minutes = timeouts.get(job);
      expect(minutes).toBeDefined();
      expect(minutes).toBeGreaterThan(0);
      expect(minutes).toBeLessThanOrEqual(30);
    },
  );
});
