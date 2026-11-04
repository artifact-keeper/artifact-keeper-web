import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  McpCapabilities,
  McpCapabilitySnapshot,
  McpCatalogItem,
  McpCatalogPin,
  McpHealth,
  McpHealthPackage,
  McpPackagePin,
  McpServedEntry,
  McpServerJson,
} from "@/types/mcp";

/** Shared fixtures and render helper for the MCP detail tests. */

export function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <TooltipProvider>{ui}</TooltipProvider>
      </QueryClientProvider>,
    ),
  };
}

export const SERVER: McpServerJson = {
  name: "com.acme/weather",
  description: "Weather forecasts",
  title: "Acme Weather",
  version: "1.4.2",
  websiteUrl: "https://acme.dev",
  repository: { url: "https://github.com/acme/weather", source: "github" },
  packages: [
    {
      registryType: "npm",
      registryBaseUrl: "https://ak.example/npm/npm-local",
      identifier: "@acme/weather-mcp",
      version: "1.4.2",
      runtimeHint: "npx",
      transport: { type: "stdio" },
      packageArguments: [{ type: "named", name: "--units", value: "metric" }],
      environmentVariables: [{ name: "ACME_API_KEY", isSecret: true, isRequired: true }],
    },
    {
      registryType: "oci",
      identifier: "ak.example/docker-local/acme/weather:1.4.2@sha256:9f3c0000000000000000",
      transport: { type: "stdio" },
      _meta: {
        "com.artifactkeeper/resolved": {
          submittedIdentifier: "acme/weather:1.4.2",
          digest: "sha256:9f3c0000000000000000",
          backingRepository: "docker-local",
          children: [{ platform: "linux/amd64", digest: "sha256:aaaa111122223333" }],
        },
      },
    },
  ],
  remotes: [{ type: "streamable-http", url: "https://mcp.acme.dev/", headers: [{ name: "Authorization", isSecret: true }] }],
};

export const PINS: McpPackagePin[] = [
  {
    index: 0,
    registryType: "npm",
    submitted: { identifier: "@acme/weather-mcp", version: "1.4.2" },
    resolved: { repository: "npm-local", artifactIds: ["art-npm"] },
  },
  {
    index: 1,
    registryType: "oci",
    submitted: { identifier: "acme/weather:1.4.2" },
    resolved: { repository: "docker-local", artifactIds: ["art-oci"], digest: "sha256:9f3c0000000000000000" },
    drift: { tag: "1.4.2" },
  },
];

export function entryOf(server: McpServerJson, over: Record<string, unknown> = {}): McpServedEntry {
  return {
    server,
    _meta: {
      "io.modelcontextprotocol.registry/official": {
        status: "active",
        isLatest: true,
        publishedAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-02T00:00:00Z",
        ...over,
      },
      "com.artifactkeeper.registry/source": {
        repository: "mcp-local",
        artifactId: `art-${server.version}`,
        packagePolicy: "own-repos",
        origin: "hosted",
        upstreamVerified: false,
      },
    },
  };
}

/** One `packages[]` row of the health roll-up, with the backend's defaults. */
export function healthPkg(over: Partial<McpHealthPackage> = {}): McpHealthPackage {
  return {
    index: 0,
    package: "npm:@acme/weather-mcp@1.4.2",
    registryType: "npm",
    repository: "npm-local",
    scanned: true,
    score: 92,
    grade: "A",
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    gate: "allowed",
    status: "ok",
    ...over,
  };
}

/** A `GET .../health` answer. */
export function healthOf(packages: Partial<McpHealthPackage>[] = [], over: Partial<McpHealth> = {}): McpHealth {
  return {
    name: "com.acme/weather",
    version: "1.4.2",
    artifactId: "art-1.4.2",
    status: "ok",
    packagePolicy: "own-repos",
    packages: packages.map((p, i) => healthPkg({ index: i, ...p })),
    lint: { ran: true, block: 0, review: 0, warn: 0, findings: [] },
    ...over,
  };
}

/** A capability snapshot (summary fields; pass `tools` etc. for a full one). */
export function snapshot(over: Partial<McpCapabilitySnapshot> = {}): McpCapabilitySnapshot {
  return {
    id: "snap-1",
    source: "remote_probe",
    provenance: "observed by remote probe",
    origin: "remote:0",
    observed: true,
    authState: "none",
    outcome: "ok",
    observedAt: "2026-10-03T00:00:00Z",
    counts: { tools: 0, resources: 0, prompts: 0 },
    createdAt: "2026-10-03T00:00:00Z",
    ...over,
  };
}

/** A `GET .../capabilities` answer: `current` is a full snapshot, `snapshots` the summaries. */
export function capsOf(
  current: McpCapabilitySnapshot | null,
  snapshots: McpCapabilitySnapshot[] = current ? [current] : [],
  over: Partial<McpCapabilities> = {},
): McpCapabilities {
  return {
    repository: "mcp-local",
    server: "com.acme/weather",
    version: "1.4.2",
    artifactId: "art-1.4.2",
    current,
    snapshots,
    introspection: { remoteProbe: "off", probeEnabled: false, sandbox: "off", sandboxEnabled: false },
    notice: "Tool lists and annotations are server-asserted.",
    ...over,
  };
}

/** A Remote catalog item (`GET /api/v1/repositories/{key}/mcp/catalog`), pending by default. */
export function catalogItem(over: Partial<McpCatalogItem> = {}): McpCatalogItem {
  const name = over.name ?? "io.github.acme/weather";
  return {
    id: "c1",
    name,
    namespace: name.split("/")[0],
    status: "pending",
    denied: false,
    title: null,
    description: "Weather forecasts",
    latestVersion: "1.2.0",
    versions: ["1.2.0", "1.1.0"],
    upstreamStatus: "active",
    upstreamUpdatedAt: "2026-10-30T00:00:00Z",
    summary: null,
    flags: {},
    approvalRequests: {},
    evaluationReason: null,
    evaluatedAt: null,
    evaluatedBy: null,
    firstSeenAt: "2026-10-01T00:00:00Z",
    pins: [],
    ingested: [],
    ...over,
  };
}

/** A `name@version` row of a catalog item. */
export function catalogPin(over: Partial<McpCatalogPin> = {}): McpCatalogPin {
  return { id: "c1@1.1.0", version: "1.1.0", status: "approved", contentDrift: null, evaluationReason: null, ...over };
}
