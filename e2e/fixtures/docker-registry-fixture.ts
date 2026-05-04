import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Captured request seen by the fixture registry. The headers map preserves the
 * raw casing-insensitive form returned by Node — keys are lowercased — and
 * values are stringified so consumers can do simple equality checks.
 */
export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Buffer;
}

/**
 * Configurable response for a given path. Headers passed here are written on
 * the response verbatim; tests rely on this to verify Docker-specific response
 * headers survive the Next.js proxy layer.
 */
export interface FixtureResponseSpec {
  status: number;
  headers?: Record<string, string>;
  body?: Buffer | string;
}

export interface FixtureRegistry {
  url: string;
  port: number;
  recordedRequests: RecordedRequest[];
  setResponse: (path: string, spec: FixtureResponseSpec) => void;
  reset: () => void;
  close: () => Promise<void>;
}

interface CreateOptions {
  port?: number;
  host?: string;
}

/**
 * Stand up an in-process HTTP server that pretends to be the upstream Docker
 * registry backend. The web layer's middleware proxy will rewrite /v2/*
 * requests here when BACKEND_URL points at this server's URL, letting tests
 * assert end-to-end which headers survive the Next.js fetch-and-forward path.
 */
export function createFixtureRegistry(options: CreateOptions = {}): Promise<FixtureRegistry> {
  const recordedRequests: RecordedRequest[] = [];
  const responseMap = new Map<string, FixtureResponseSpec>();

  const readBody = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolveBody) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolveBody(Buffer.concat(chunks)));
    });

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? "/";

    // ---- Control plane (used only by the test process) -----------------
    // Routed under __fixture so it can never collide with the Docker
    // Registry namespace, which is rooted at /v2.
    if (url.startsWith("/__fixture/")) {
      if (req.method === "GET" && url === "/__fixture/requests") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(recordedRequests.map(serializeRecorded)));
        return;
      }
      if (req.method === "POST" && url === "/__fixture/reset") {
        recordedRequests.length = 0;
        responseMap.clear();
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method === "POST" && url === "/__fixture/responses") {
        const body = await readBody(req);
        const parsed = JSON.parse(body.toString("utf8")) as {
          path: string;
          spec: FixtureResponseSpec & { body?: string };
        };
        responseMap.set(parsed.path, {
          status: parsed.spec.status,
          headers: parsed.spec.headers,
          body: parsed.spec.body,
        });
        res.statusCode = 204;
        res.end();
        return;
      }
      res.statusCode = 404;
      res.end();
      return;
    }

    // ---- Registry-facing path ------------------------------------------
    const body = await readBody(req);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        headers[key.toLowerCase()] = value.join(", ");
      }
    }

    recordedRequests.push({
      method: req.method ?? "GET",
      path: url,
      headers,
      body,
    });

    const pathOnly = url.split("?")[0];
    const spec = responseMap.get(url) ?? responseMap.get(pathOnly);

    if (!spec) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ errors: [{ code: "NOT_FOUND", message: "no fixture configured" }] }));
      return;
    }

    res.statusCode = spec.status;
    for (const [key, value] of Object.entries(spec.headers ?? {})) {
      res.setHeader(key, value);
    }
    if (spec.body !== undefined) {
      res.end(typeof spec.body === "string" ? Buffer.from(spec.body) : spec.body);
    } else {
      res.end();
    }
  };

  function serializeRecorded(r: RecordedRequest): {
    method: string;
    path: string;
    headers: Record<string, string>;
    bodyBase64: string;
  } {
    return {
      method: r.method,
      path: r.path,
      headers: r.headers,
      bodyBase64: r.body.toString("base64"),
    };
  }

  const server: Server = createServer((req, res) => {
    handler(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
      }
      res.end(JSON.stringify({ errors: [{ code: "FIXTURE_ERROR", message }] }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        port,
        recordedRequests,
        setResponse: (path, spec) => responseMap.set(path, spec),
        reset: () => {
          recordedRequests.length = 0;
          responseMap.clear();
        },
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => (err ? rejectClose(err) : resolveClose()));
          }),
      });
    });
  });
}
