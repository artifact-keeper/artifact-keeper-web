import { defineConfig } from "@playwright/test";

/**
 * Dedicated config for issue #336 — exercises the Docker /v2/* middleware
 * proxy against a fixture HTTP backend (no real registry, no docker daemon).
 *
 * Boots two processes via `webServer`:
 *   1. The fixture HTTP server on FIXTURE_PORT (acts as the "backend").
 *   2. A real Next.js production server (next start) with BACKEND_URL
 *      pointing at the fixture, so middleware rewrites land there.
 *
 * Kept separate from playwright.config.ts because that config's webServer
 * (currently none) and project setup target the docker-compose stack with
 * the real backend; this suite intentionally bypasses the backend.
 */

const FIXTURE_PORT = Number(process.env.FIXTURE_PORT ?? 4500);
const WEB_PORT = Number(process.env.DOCKER_PROXY_WEB_PORT ?? 3001);
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e/suites/docker-proxy",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `npx tsx e2e/fixtures/run-docker-registry-fixture.ts`,
      url: `http://127.0.0.1:${FIXTURE_PORT}/__fixture/requests`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { FIXTURE_PORT: String(FIXTURE_PORT) },
    },
    {
      // `next start` (not `next dev`) — middleware behavior under dev mode
      // diverges from production; this suite exists specifically to verify
      // the production rewrite path. The "next start does not work with
      // output: standalone" warning emitted at startup is benign for our
      // purposes: middleware still runs and rewrites are followed; the
      // warning concerns asset/image caching paths which we don't exercise.
      // --hostname 127.0.0.1 keeps the Next process off the runner's external
      // interfaces — no reason for this short-lived test server to be reachable
      // beyond loopback.
      command: `npm run build && npx next start --hostname 127.0.0.1 --port ${WEB_PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        BACKEND_URL: `http://127.0.0.1:${FIXTURE_PORT}`,
        NODE_ENV: "production",
      },
    },
  ],
});
