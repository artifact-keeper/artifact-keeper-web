import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

/**
 * End-to-end coverage for issue #336 — verify that the Next.js middleware
 * proxy preserves Docker-Distribution-API headers in both directions.
 *
 * Unit tests (src/__tests__/middleware.test.ts) only assert that
 * NextResponse.rewrite() is called with the right URL; they cannot verify
 * what Next.js does at runtime when it follows that rewrite. These tests
 * point a real Next.js (next start) at a fixture HTTP server and observe
 * what the fixture sees and what the client receives.
 */

interface RecordedRequestSerialized {
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

const FIXTURE_PORT = Number(process.env.FIXTURE_PORT ?? 4500);
const FIXTURE_URL = `http://127.0.0.1:${FIXTURE_PORT}`;
const WEB_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";

async function setFixtureResponse(
  control: APIRequestContext,
  path: string,
  spec: { status: number; headers?: Record<string, string>; body?: string },
): Promise<void> {
  const res = await control.post(`${FIXTURE_URL}/__fixture/responses`, {
    data: { path, spec },
  });
  expect(res.status(), "fixture setResponse").toBe(204);
}

async function resetFixture(control: APIRequestContext): Promise<void> {
  const res = await control.post(`${FIXTURE_URL}/__fixture/reset`);
  expect(res.status(), "fixture reset").toBe(204);
}

async function getRecordedRequests(
  control: APIRequestContext,
): Promise<RecordedRequestSerialized[]> {
  const res = await control.get(`${FIXTURE_URL}/__fixture/requests`);
  expect(res.status(), "fixture requests").toBe(200);
  return (await res.json()) as RecordedRequestSerialized[];
}

test.describe("Docker /v2/* header forwarding through Next.js middleware", () => {
  let control: APIRequestContext;
  let client: APIRequestContext;

  test.beforeAll(async () => {
    control = await pwRequest.newContext();
    // Separate client context — extraHTTPHeaders applied per-request below
    // since each test parametrizes a different header.
    client = await pwRequest.newContext({ baseURL: WEB_BASE_URL });
  });

  test.afterAll(async () => {
    await control.dispose();
    await client.dispose();
  });

  test.beforeEach(async () => {
    await resetFixture(control);
  });

  // The fixture instance is shared by all tests in this describe; per-test
  // isolation depends on `workers: 1` + `fullyParallel: false` in
  // playwright-docker-proxy.config.ts plus the `beforeEach(reset)` above.
  // If parallelism is ever enabled, these tests would observe each other's
  // recorded requests — flip the spec to filter by a per-test correlation
  // header (e.g. `x-test-id`) before relaxing the worker count.

  // ------------------------------------------------------------------
  // Request headers (web --> backend) — issue #336.
  //
  // Note on Content-Length: it isn't covered here because Next.js's fetch
  // path recomputes it for the upstream request — asserting a literal value
  // tests undici, not the middleware. The body-bearing POST test below
  // covers Content-Length forwarding indirectly (length implied by body).
  // ------------------------------------------------------------------
  const requestHeaderCases: Array<{ name: string; value: string }> = [
    // Lock-in: middleware MUST forward Authorization for Docker login to
    // work. If a future hardening pass strips auth defensively, replace
    // this assertion with a path-allow-list check rather than removing it.
    { name: "Authorization", value: "Bearer test-token-abc123" },
    { name: "Content-Range", value: "bytes 0-1023/2048" },
    { name: "Content-Type", value: "application/vnd.docker.distribution.manifest.v2+json" },
    { name: "Docker-Distribution-API-Version", value: "registry/2.0" },
  ];

  for (const { name, value } of requestHeaderCases) {
    test(`forwards request header ${name} to backend`, async () => {
      const path = `/v2/test-repo/manifests/header-${name.toLowerCase()}`;
      await setFixtureResponse(control, path, { status: 200 });

      const res = await client.get(path, { headers: { [name]: value } });
      expect(res.status()).toBe(200);

      const recorded = await getRecordedRequests(control);
      expect(recorded.length).toBeGreaterThanOrEqual(1);
      const seen = recorded.find((r) => r.path === path);
      expect(seen, `fixture should have observed ${path}`).toBeDefined();
      expect(seen!.headers[name.toLowerCase()]).toBe(value);
    });
  }

  // ------------------------------------------------------------------
  // Body forwarding on PATCH blob upload — exercises the realistic Docker
  // push code path. This is where Content-Length and Content-Range matter:
  // the Docker client streams blob chunks via PATCH /v2/<name>/blobs/uploads/<uuid>
  // with `Content-Range: bytes <start>-<end>/<total>`. If middleware drops
  // either header (or mangles the body), the upload never completes.
  // ------------------------------------------------------------------
  test("forwards request body, Content-Length, and Content-Range on PATCH blob upload", async () => {
    const path = "/v2/test-repo/blobs/uploads/blob-upload-uuid-1";
    await setFixtureResponse(control, path, {
      status: 202,
      headers: { "Docker-Upload-UUID": "blob-upload-uuid-1", Range: "0-1023" },
    });

    const chunk = Buffer.alloc(1024, 0xab);
    const res = await client.fetch(path, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": "bytes 0-1023/2048",
      },
      data: chunk,
    });
    expect(res.status()).toBe(202);

    const recorded = await getRecordedRequests(control);
    const seen = recorded.find((r) => r.path === path);
    expect(seen, `fixture should have observed ${path}`).toBeDefined();
    expect(seen!.method).toBe("PATCH");
    expect(seen!.headers["content-range"]).toBe("bytes 0-1023/2048");
    // Content-Length is set by the HTTP layer; assert it's a positive number
    // matching the body length rather than a literal string we passed.
    expect(Number(seen!.headers["content-length"])).toBe(chunk.length);
    expect(Buffer.from(seen!.bodyBase64, "base64").length).toBe(chunk.length);
  });

  // ------------------------------------------------------------------
  // Response headers (backend --> web --> client) — issue #336
  // ------------------------------------------------------------------
  const responseHeaderCases: Array<{ name: string; value: string }> = [
    {
      name: "WWW-Authenticate",
      value: 'Bearer realm="https://example.test/token",service="registry"',
    },
    {
      name: "Docker-Content-Digest",
      value: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd",
    },
    { name: "Docker-Upload-UUID", value: "11111111-2222-3333-4444-555555555555" },
    { name: "Range", value: "0-1023" },
    { name: "Location", value: "/v2/test-repo/blobs/uploads/abc123?_state=xyz" },
  ];

  for (const { name, value } of responseHeaderCases) {
    test(`propagates response header ${name} back to client`, async () => {
      const path = `/v2/test-repo/blobs/header-${name.toLowerCase()}`;
      await setFixtureResponse(control, path, {
        // 401 keeps WWW-Authenticate semantically correct without changing
        // behavior for the other headers.
        status: name === "WWW-Authenticate" ? 401 : 200,
        headers: { [name]: value },
      });

      const res = await client.get(path);
      expect(res.status()).toBe(name === "WWW-Authenticate" ? 401 : 200);
      const headers = res.headers();
      expect(headers[name.toLowerCase()]).toBe(value);
    });
  }

  // ------------------------------------------------------------------
  // Realistic flow: docker login pings /v2/, gets WWW-Authenticate,
  // then follows up to a token endpoint. This is the exact sequence
  // #1007 was trying to fix; we verify the proxy hand-off works.
  // ------------------------------------------------------------------
  test("docker login flow: GET /v2/ returns 401 + WWW-Authenticate, follow-up succeeds", async () => {
    await setFixtureResponse(control, "/v2/", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="http://127.0.0.1/token",service="registry"',
        "Docker-Distribution-API-Version": "registry/2.0",
      },
    });
    await setFixtureResponse(control, "/v2/library/alpine/manifests/latest", {
      status: 200,
      headers: {
        "Docker-Content-Digest": "sha256:deadbeef".padEnd(71, "0"),
        "Content-Type": "application/vnd.docker.distribution.manifest.v2+json",
      },
      body: '{"schemaVersion":2}',
    });

    const ping = await client.get("/v2/", {
      headers: { "Docker-Distribution-API-Version": "registry/2.0" },
    });
    expect(ping.status()).toBe(401);
    expect(ping.headers()["www-authenticate"]).toContain("Bearer");
    expect(ping.headers()["docker-distribution-api-version"]).toBe("registry/2.0");

    const manifest = await client.get("/v2/library/alpine/manifests/latest", {
      headers: { Authorization: "Bearer issued-by-token-realm" },
    });
    expect(manifest.status()).toBe(200);
    expect(manifest.headers()["docker-content-digest"]).toMatch(/^sha256:/);

    const recorded = await getRecordedRequests(control);
    const pingRecord = recorded.find((r) => r.path === "/v2/");
    expect(pingRecord, "fixture saw /v2/ ping").toBeDefined();
    expect(pingRecord!.headers["docker-distribution-api-version"]).toBe("registry/2.0");

    const manifestRecord = recorded.find((r) => r.path === "/v2/library/alpine/manifests/latest");
    expect(manifestRecord, "fixture saw manifest GET").toBeDefined();
    expect(manifestRecord!.headers["authorization"]).toBe("Bearer issued-by-token-realm");
  });
});
