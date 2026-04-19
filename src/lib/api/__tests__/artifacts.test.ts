import { describe, it, expect, vi, beforeEach } from "vitest";

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
