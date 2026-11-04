import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { McpPackagePin, McpServedEntry, McpServerJson } from "@/types/mcp";

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
      "com.artifactkeeper.registry/source": { repository: "mcp-local", artifactId: `art-${server.version}`, packagePolicy: "own-repos" },
    },
  };
}
