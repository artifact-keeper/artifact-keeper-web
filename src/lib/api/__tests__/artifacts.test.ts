import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
}));

const mockListArtifacts = vi.fn();
const mockDeleteArtifact = vi.fn();
const mockCreateDownloadTicket = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listArtifacts: (...args: unknown[]) => mockListArtifacts(...args),
  deleteArtifact: (...args: unknown[]) => mockDeleteArtifact(...args),
  createDownloadTicket: (...args: unknown[]) => mockCreateDownloadTicket(...args),
}));

describe("artifactsApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list returns paginated artifacts", async () => {
    const data = { items: [{ id: "a1" }], pagination: { total: 1 } };
    mockListArtifacts.mockResolvedValue({ data, error: undefined });
    const { artifactsApi } = await import("../artifacts");
    expect(await artifactsApi.list("repo-key")).toEqual(data);
  });

  it("list throws on error", async () => {
    mockListArtifacts.mockResolvedValue({ data: undefined, error: "fail" });
    const { artifactsApi } = await import("../artifacts");
    await expect(artifactsApi.list("repo-key")).rejects.toBe("fail");
  });

  it("list maps search param to q for backwards compat", async () => {
    mockListArtifacts.mockResolvedValue({ data: { items: [] }, error: undefined });
    const { artifactsApi } = await import("../artifacts");
    await artifactsApi.list("repo-key", { search: "test" });
    expect(mockListArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ q: "test" }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // listGrouped (issues #254, #330)
  // -------------------------------------------------------------------------

  describe("listGrouped (Maven component grouping #254)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("issues GET to /api/v1/repositories/:key/artifacts with group_by=maven_component", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          items: [],
          pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 },
          components: [],
        }),
      });
      global.fetch = fetchMock;

      const { artifactsApi } = await import("../artifacts");
      await artifactsApi.listGrouped("maven-releases", {
        group_by: "maven_component",
        page: 1,
        per_page: 20,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain("/api/v1/repositories/maven-releases/artifacts");
      expect(url).toContain("group_by=maven_component");
      expect(url).toContain("page=1");
      expect(url).toContain("per_page=20");
      // Send credentials so cookie auth flows through
      expect(fetchMock.mock.calls[0][1]).toEqual(
        expect.objectContaining({ credentials: "include" })
      );
    });

    it("URL-encodes the repository key", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ items: [], pagination: {} }),
      });
      global.fetch = fetchMock;

      const { artifactsApi } = await import("../artifacts");
      await artifactsApi.listGrouped("repo with spaces", {});
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain("/api/v1/repositories/repo%20with%20spaces/artifacts");
    });

    it("preserves the components array in the response", async () => {
      const components = [
        {
          id: "c1",
          group_id: "com.example",
          artifact_id: "lib",
          version: "1.0",
          repository_key: "maven-releases",
          format: "maven",
          size_bytes: 100,
          download_count: 0,
          created_at: "2026-01-01T00:00:00Z",
          artifact_files: ["lib-1.0.jar"],
        },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          items: [],
          pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
          components,
        }),
      });

      const { artifactsApi } = await import("../artifacts");
      const result = await artifactsApi.listGrouped("maven-releases", {
        group_by: "maven_component",
      });
      expect(result.components).toEqual(components);
    });

    it("returns an empty items array when raw response omits items", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 },
        }),
      });

      const { artifactsApi } = await import("../artifacts");
      const result = await artifactsApi.listGrouped("maven-releases", {});
      expect(result.items).toEqual([]);
    });

    it("throws on non-ok response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const { artifactsApi } = await import("../artifacts");
      await expect(
        artifactsApi.listGrouped("maven-releases", {})
      ).rejects.toThrow("Failed to list artifacts: 500");
    });

    it("includes path_prefix and q in the URL when provided", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ items: [], pagination: {} }),
      });
      global.fetch = fetchMock;

      const { artifactsApi } = await import("../artifacts");
      await artifactsApi.listGrouped("maven-releases", {
        path_prefix: "com/example",
        q: "lib",
        group_by: "maven_component",
      });
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain("path_prefix=com%2Fexample");
      expect(url).toContain("q=lib");
    });

    it("falls back from `list` to `listGrouped` when group_by is set", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          items: [{ id: "a1", path: "foo.jar" }],
          pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
          components: [],
        }),
      });
      global.fetch = fetchMock;

      const { artifactsApi } = await import("../artifacts");
      const result = await artifactsApi.list("maven-releases", {
        group_by: "maven_component",
      });
      // When delegating, list() drops the components and returns items+pagination
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // SDK was NOT called — direct fetch used the grouped branch
      expect(mockListArtifacts).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
    });
  });

  it("get fetches artifact metadata via fetch", async () => {
    const artifact = { id: "a1", path: "com/example/lib.jar" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(artifact),
    });

    const { artifactsApi } = await import("../artifacts");
    const result = await artifactsApi.get("repo-key", "com/example/lib.jar");
    expect(result).toEqual(artifact);

    vi.restoreAllMocks();
  });

  it("get throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const { artifactsApi } = await import("../artifacts");
    await expect(
      artifactsApi.get("repo-key", "missing.jar")
    ).rejects.toThrow("Failed to fetch artifact: 404");

    vi.restoreAllMocks();
  });

  it("delete calls SDK", async () => {
    mockDeleteArtifact.mockResolvedValue({ error: undefined });
    const { artifactsApi } = await import("../artifacts");
    await artifactsApi.delete("repo-key", "lib.jar");
    expect(mockDeleteArtifact).toHaveBeenCalled();
  });

  it("delete throws on error", async () => {
    mockDeleteArtifact.mockResolvedValue({ error: "fail" });
    const { artifactsApi } = await import("../artifacts");
    await expect(artifactsApi.delete("repo-key", "lib.jar")).rejects.toBe("fail");
  });

  it("getDownloadUrl returns correct URL", async () => {
    const { artifactsApi } = await import("../artifacts");
    expect(artifactsApi.getDownloadUrl("repo-key", "com/lib.jar")).toBe(
      "/api/v1/repositories/repo-key/download/com/lib.jar"
    );
  });

  it("createDownloadTicket returns ticket string", async () => {
    mockCreateDownloadTicket.mockResolvedValue({
      data: { ticket: "tk123" },
      error: undefined,
    });
    const { artifactsApi } = await import("../artifacts");
    expect(await artifactsApi.createDownloadTicket("repo-key", "lib.jar")).toBe("tk123");
  });

  it("createDownloadTicket throws on error", async () => {
    mockCreateDownloadTicket.mockResolvedValue({ data: undefined, error: "fail" });
    const { artifactsApi } = await import("../artifacts");
    await expect(artifactsApi.createDownloadTicket("repo-key", "lib.jar")).rejects.toBe("fail");
  });

  // ---- upload() via XMLHttpRequest ----

  describe("upload", () => {
    let xhrInstances: Array<Record<string, any>>;

    function mockXHR() {
      xhrInstances = [];
      function FakeXHR(this: Record<string, any>) {
        this.open = vi.fn();
        this.send = vi.fn();
        this.withCredentials = false;
        this.upload = { onprogress: null as any };
        this.onload = null as any;
        this.onerror = null as any;
        this.status = 0;
        this.responseText = "";
        xhrInstances.push(this);
      }
      vi.stubGlobal("XMLHttpRequest", FakeXHR);
    }

    beforeEach(() => {
      mockXHR();
    });

    it("resolves with parsed artifact on 2xx response", async () => {
      const { artifactsApi } = await import("../artifacts");
      const file = new File(["data"], "test.jar", { type: "application/java-archive" });

      const promise = artifactsApi.upload("my-repo", file);
      const xhr = xhrInstances[0];

      xhr.status = 201;
      xhr.responseText = JSON.stringify({ id: "a1", path: "test.jar" });
      xhr.onload();

      const result = await promise;
      expect(result).toEqual({ id: "a1", path: "test.jar" });
      expect(xhr.open).toHaveBeenCalledWith(
        "POST",
        "http://localhost:8080/api/v1/repositories/my-repo/artifacts"
      );
      expect(xhr.withCredentials).toBe(true);
    });

    it("appends path to FormData when provided", async () => {
      const { artifactsApi } = await import("../artifacts");
      const file = new File(["data"], "lib.jar");

      const promise = artifactsApi.upload("my-repo", file, "libs/lib-1.0.jar");
      const xhr = xhrInstances[0];

      // Verify FormData was sent with the path
      const sentFormData = xhr.send.mock.calls[0][0] as FormData;
      expect(sentFormData.get("path")).toBe("libs/lib-1.0.jar");
      expect(sentFormData.get("file")).toBeInstanceOf(File);

      xhr.status = 200;
      xhr.responseText = JSON.stringify({ id: "a2" });
      xhr.onload();

      await promise;
    });

    it("calls onProgress callback during upload", async () => {
      const { artifactsApi } = await import("../artifacts");
      const file = new File(["data"], "test.jar");
      const onProgress = vi.fn();

      const promise = artifactsApi.upload("my-repo", file, undefined, onProgress);
      const xhr = xhrInstances[0];

      // Simulate progress event
      xhr.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
      expect(onProgress).toHaveBeenCalledWith(50);

      xhr.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
      expect(onProgress).toHaveBeenCalledWith(100);

      // Non-computable events should be ignored
      xhr.upload.onprogress({ lengthComputable: false, loaded: 0, total: 0 });
      expect(onProgress).toHaveBeenCalledTimes(2);

      xhr.status = 200;
      xhr.responseText = JSON.stringify({ id: "a3" });
      xhr.onload();

      await promise;
    });

    it("rejects with 413 message for payload-too-large responses", async () => {
      const { artifactsApi } = await import("../artifacts");
      const file = new File(["data"], "huge.bin");

      const promise = artifactsApi.upload("my-repo", file);
      const xhr = xhrInstances[0];

      xhr.status = 413;
      xhr.responseText = JSON.stringify({ error: "Payload Too Large" });
      xhr.onload();

      await expect(promise).rejects.toThrow(
        "File exceeds the maximum upload size allowed by the server."
      );
    });

    it("rejects with server error detail on non-2xx response", async () => {
      const { artifactsApi } = await import("../artifacts");
      const file = new File(["data"], "bad.jar");

      const promise = artifactsApi.upload("my-repo", file);
      const xhr = xhrInstances[0];

      xhr.status = 400;
      xhr.responseText = JSON.stringify({ error: "Invalid artifact format" });
      xhr.onload();

      await expect(promise).rejects.toThrow("Invalid artifact format");
    });

    it("rejects with message field when error field is absent", async () => {
      const { artifactsApi } = await import("../artifacts");
      const file = new File(["data"], "bad.jar");

      const promise = artifactsApi.upload("my-repo", file);
      const xhr = xhrInstances[0];

      xhr.status = 500;
      xhr.responseText = JSON.stringify({ message: "Internal server error" });
      xhr.onload();

      await expect(promise).rejects.toThrow("Internal server error");
    });

    it("rejects with generic status message when response is not JSON", async () => {
      const { artifactsApi } = await import("../artifacts");
      const file = new File(["data"], "bad.jar");

      const promise = artifactsApi.upload("my-repo", file);
      const xhr = xhrInstances[0];

      xhr.status = 502;
      xhr.responseText = "Bad Gateway";
      xhr.onload();

      await expect(promise).rejects.toThrow("Upload failed with status 502");
    });

    it("rejects with network error on onerror", async () => {
      const { artifactsApi } = await import("../artifacts");
      const file = new File(["data"], "test.jar");

      const promise = artifactsApi.upload("my-repo", file);
      const xhr = xhrInstances[0];

      xhr.onerror();

      await expect(promise).rejects.toThrow(
        "Upload failed. Check your network connection and try again."
      );
    });
  });
});
