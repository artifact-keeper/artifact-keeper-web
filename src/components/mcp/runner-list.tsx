import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { McpInputsTable } from "@/components/mcp/env-vars-table";
import { resolvedMeta } from "@/lib/mcp/server-json";
import type { McpPackage, McpPackagePin, McpServerJson, McpTransport } from "@/types/mcp";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-xs leading-5">{children}</dd>
    </div>
  );
}

/** The "declares no way to run it" warning, shared with the install panel. */
export function McpNoRunnerAlert() {
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>This entry declares no way to run it</AlertTitle>
      <AlertDescription>
        The server.json has neither packages nor remotes, so no client can start or reach it.
      </AlertDescription>
    </Alert>
  );
}

function PackageRunner({ pkg, pin, index }: { pkg: McpPackage; pin?: McpPackagePin; index: number }) {
  const resolved = resolvedMeta(pkg);
  const digest = resolved?.digest ?? pin?.resolved.digest;
  const submitted =
    resolved?.submittedIdentifier ??
    (pin ? `${pin.submitted.identifier}${pin.submitted.version ? `@${pin.submitted.version}` : ""}` : undefined);
  const backing = resolved?.backingRepository ?? pin?.resolved.repository;
  const args = [...(pkg.runtimeArguments ?? []), ...(pkg.packageArguments ?? [])];
  return (
    <section aria-label={`Package ${index + 1}: ${pkg.registryType} ${pkg.identifier}`} className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{pkg.registryType}</Badge>
        <Badge variant="outline" className="font-mono font-normal">
          {pkg.transport?.type ?? "stdio"}
        </Badge>
        {pkg.version && (
          <Badge variant="outline" className="font-mono font-normal">
            v{pkg.version}
          </Badge>
        )}
        {pin?.drift && (
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
            title="The pinned tag now points elsewhere; this version still serves the pinned digest."
          >
            tag moved
          </Badge>
        )}
      </div>
      <dl className="space-y-1">
        <Field label="Served identifier">{pkg.identifier}</Field>
        {digest && !pkg.identifier.includes(digest) && <Field label="Pinned digest">{digest}</Field>}
        {submitted && submitted !== pkg.identifier && <Field label="Submitted as">{submitted}</Field>}
        {backing && (
          <Field label="Backing repository">
            <Link href={`/repositories/${encodeURIComponent(backing)}`} className="text-primary hover:underline">
              {backing}
            </Link>
          </Field>
        )}
        {pkg.registryBaseUrl && <Field label="Registry">{pkg.registryBaseUrl}</Field>}
        {pkg.runtimeHint && <Field label="Runtime">{pkg.runtimeHint}</Field>}
      </dl>
      <McpInputsTable inputs={pkg.environmentVariables ?? []} caption="Environment variables" />
      <McpInputsTable inputs={args} caption="Arguments" />
    </section>
  );
}

function RemoteRunner({ remote, index }: { remote: McpTransport; index: number }) {
  return (
    <section aria-label={`Remote ${index + 1}: ${remote.type}`} className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">remote</Badge>
        <Badge variant="outline" className="font-mono font-normal">
          {remote.type}
        </Badge>
      </div>
      <dl className="space-y-1">
        {/* Shown as text: the endpoint is for a client, not a page to visit. */}
        <Field label="URL">{remote.url ?? ""}</Field>
      </dl>
      <McpInputsTable inputs={remote.headers ?? []} caption="Headers" />
    </section>
  );
}

/**
 * "Ways to run": every package (with its Artifact Keeper pin: served
 * coordinates, submitted reference, backing repository, tag drift) and every
 * remote of a server version.
 */
export function McpRunnerList({ server, pins, repoKey }: { server: McpServerJson; pins?: McpPackagePin[]; repoKey: string }) {
  const packages = server.packages ?? [];
  const remotes = server.remotes ?? [];
  if (packages.length === 0 && remotes.length === 0) return <McpNoRunnerAlert />;
  return (
    <div className="space-y-3" data-repo={repoKey}>
      {packages.map((pkg, i) => (
        <PackageRunner key={`p${i}`} pkg={pkg} index={i} pin={pins?.find((p) => p.index === i)} />
      ))}
      {remotes.map((r, i) => (
        <RemoteRunner key={`r${i}`} remote={r} index={i} />
      ))}
    </div>
  );
}
