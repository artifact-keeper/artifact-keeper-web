import { createFixtureRegistry } from "./docker-registry-fixture";

/**
 * Tiny entry point used by Playwright's webServer to boot the fixture as
 * its own process. Reads PORT from env (deterministic so the Next.js process
 * can be configured via BACKEND_URL), prints the URL on stdout, and stays
 * alive until killed by Playwright.
 */
async function main(): Promise<void> {
  const port = process.env.FIXTURE_PORT ? Number(process.env.FIXTURE_PORT) : 4500;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`invalid FIXTURE_PORT: ${process.env.FIXTURE_PORT}`);
  }

  const fixture = await createFixtureRegistry({ port });
  process.stdout.write(`docker-registry-fixture listening on ${fixture.url}\n`);

  const shutdown = async (): Promise<void> => {
    await fixture.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`fixture failed to start: ${String(err)}\n`);
  process.exit(1);
});
