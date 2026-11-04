import React from "react";
import {
  MCP_AK_RESOLVED_META_KEY,
  MCP_AK_SOURCE_META_KEY,
  MCP_OFFICIAL_META_KEY,
  type McpServedEntry,
  type McpServerJson,
} from "@/types/mcp";

/**
 * Served entries shared by the MCP component tests: an npm server with a
 * secret env var and a remote, an OCI server pinned by digest, a remote-only
 * server with a secret header, and a deprecated pypi server.
 */

export function served(server: McpServerJson, meta: Record<string, unknown> = {}): McpServedEntry {
  return {
    server,
    _meta: {
      [MCP_OFFICIAL_META_KEY]: { status: "active", isLatest: true, publishedAt: "2026-10-01T00:00:00Z" },
      [MCP_AK_SOURCE_META_KEY]: { repository: "mcp-local", artifactId: "a1", packagePolicy: "own-repos" },
      ...meta,
    },
  };
}

export const WEATHER = served({
  name: "com.acme/weather",
  description: "Weather forecasts and alerts",
  version: "1.4.2",
  packages: [
    {
      registryType: "npm",
      registryBaseUrl: "https://ak.example/npm/npm-local",
      identifier: "@acme/weather-mcp",
      version: "1.4.2",
      transport: { type: "stdio" },
      environmentVariables: [
        { name: "ACME_API_KEY", description: "API key", isRequired: true, isSecret: true },
        { name: "ACME_REGION", description: "Region", default: "us-east-1" },
      ],
      packageArguments: [{ type: "named", name: "--units", choices: ["metric", "imperial"], default: "metric" }],
    },
  ],
  remotes: [
    {
      type: "streamable-http",
      url: "https://mcp.acme.dev/mcp",
      headers: [{ name: "Authorization", value: "Bearer {token}", variables: { token: { isSecret: true } } }],
    },
  ],
});

export const WEATHER_OLD = served(
  { ...WEATHER.server, version: "1.3.0", packages: [{ ...WEATHER.server.packages![0], version: "1.3.0" }] },
  { [MCP_OFFICIAL_META_KEY]: { status: "active", isLatest: false } },
);

export const SQL = served({
  name: "com.acme/sql",
  description: "Read-only SQL for agents",
  version: "2.0.0",
  packages: [
    {
      registryType: "oci",
      identifier: "ak.example/docker-local/acme/sql:2.0.0@sha256:abc123",
      transport: { type: "stdio" },
      environmentVariables: [{ name: "DATABASE_URL", isRequired: true, isSecret: true }],
      _meta: {
        [MCP_AK_RESOLVED_META_KEY]: {
          submittedIdentifier: "ghcr.io/acme/sql:2.0.0",
          digest: "sha256:abc123",
          backingRepository: "docker-local",
        },
      },
    },
  ],
});

export const REMOTE_ONLY = served({
  name: "io.github.acme/remote",
  description: "Hosted only",
  version: "0.9.0",
  remotes: [{ type: "sse", url: "https://sse.acme.dev/", headers: [{ name: "X-Api-Key", isSecret: true, isRequired: true }] }],
});

export const LEGACY = served(
  {
    name: "com.acme/legacy",
    description: "Old python server",
    version: "0.1.0",
    packages: [{ registryType: "pypi", identifier: "acme-legacy", version: "0.1.0", transport: { type: "stdio" } }],
  },
  { [MCP_OFFICIAL_META_KEY]: { status: "deprecated", isLatest: true } },
);

export const EMPTY = served({ name: "com.acme/empty", description: "Nothing to run", version: "1.0.0" });

/**
 * Native `<select>` stand-in for the Radix Select, forwarding the trigger's
 * `aria-label`, so tests can pick an option with `fireEvent.change`.
 */
export function selectMock() {
  type El = React.ReactElement<{ "aria-label"?: string; children?: React.ReactNode; value?: string }>;
  const collect = (children: React.ReactNode, items: { value: string; label: string }[], meta: { label: string }) => {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const el = child as El;
      if (el.props["aria-label"]) meta.label = el.props["aria-label"];
      if (typeof el.props.value === "string" && el.type !== "select") {
        items.push({ value: el.props.value, label: React.Children.toArray(el.props.children).join("") });
      } else {
        collect(el.props.children, items, meta);
      }
    });
  };
  return {
    Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
      const items: { value: string; label: string }[] = [];
      const meta = { label: "" };
      collect(children, items, meta);
      return (
        <select aria-label={meta.label} value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
          <option value="" disabled>
            -
          </option>
          {items.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      );
    },
    SelectTrigger: ({ children }: { children: React.ReactNode; "aria-label"?: string }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ children }: { value: string; children: React.ReactNode }) => <>{children}</>,
  };
}
