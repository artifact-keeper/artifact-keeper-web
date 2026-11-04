import Link from "next/link";
import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import type { McpHoldProblem, McpVersionRead } from "@/types/mcp";

/**
 * "Why can't my client see this?" for a version the registry does not serve
 * (artifact-keeper#5253, decision 2). Driven only by what
 * `GET /servers/{name}/versions/{version}` answered this caller:
 *
 * - `held`: the reason-gated problem body a repository holder gets. It names
 *   the hold class and, for a package hold, the package as submitted; it
 *   never carries the backing repository or an artifact id, and this panel
 *   does not go looking for them.
 * - `hidden`: the plain 404. By design the caller cannot tell a held version
 *   from a deleted or missing one, so the text stays neutral.
 * - `unavailable`: 503, the gate could not be evaluated (fail closed).
 */

type HoldKind =
  | "quarantine"
  | "scan_policy"
  | "backing_held"
  | "backing_refused"
  | "age_gate"
  | "server_age_gate"
  | "unresolvable"
  | "resolving"
  | "curation"
  | "curation_rejected"
  | "content_drift"
  | "unknown";

/**
 * The hold a problem body describes, as `decide_mcp_serve` writes it. Curation
 * and content drift share `gate: curation`, so `hold` tells them apart; the
 * curation outcome (pending or rejected) is in `error`. An age gate names a
 * `package` when a pinned package is too new and none when the server version
 * itself is (a Remote's server-version age gate).
 */
export function classifyHold(p: McpHoldProblem): HoldKind {
  const { hold, gate, error } = p;
  if (hold === "content_drift") return "content_drift";
  if (error === "mcp_age_gate_blocked" || gate === "age_gate" || hold === "age_gate") {
    return p.package ? "age_gate" : "server_age_gate";
  }
  if (hold === "curation" || hold === "pending_review" || gate === "curation") {
    return error === "mcp_rejected" ? "curation_rejected" : "curation";
  }
  if (hold === "unresolvable" || error === "mcp_unresolvable") return "unresolvable";
  if (hold === "resolving" || error === "mcp_resolving") return "resolving";
  if (hold === "backing" || error === "mcp_backing_artifact_blocked") {
    return gate === "scan_policy" ? "backing_refused" : "backing_held";
  }
  if (hold === "scan_policy" || error === "mcp_rejected") return "scan_policy";
  if (hold === "quarantine" || error === "mcp_pending_review") return "quarantine";
  return "unknown";
}

function pkgText(p: McpHoldProblem): ReactNode {
  return p.package ? <code className="font-mono text-xs">{p.package}</code> : "a package it runs";
}

function ageText(p: McpHoldProblem): string {
  if (typeof p.min_age_days !== "number") return "";
  const age = typeof p.requested_age_days === "number" ? `; it is ${p.requested_age_days} days old` : "";
  return ` (at least ${p.min_age_days} days${age})`;
}

const linkClass = "text-primary underline-offset-4 hover:underline";

function ageGateNext(p: McpHoldProblem): ReactNode {
  return p.review_id ? (
    <Link href={`/age-gate?review=${encodeURIComponent(p.review_id)}`} className={linkClass}>
      Review it in Age Gate
    </Link>
  ) : (
    "It is served once it is old enough or an administrator approves it."
  );
}

function curationLink(repoKey: string): ReactNode {
  return (
    <Link href={`/curation?repo=${encodeURIComponent(repoKey)}`} className={linkClass}>
      Open the curation queue
    </Link>
  );
}

function reasonOf(p: McpHoldProblem, repoKey: string): { title: string; body: ReactNode } {
  const pkg = pkgText(p);
  switch (classifyHold(p)) {
    case "quarantine":
      return { title: "Pending review", body: "This server version is held for review before clients can read it." };
    case "scan_policy":
      return { title: "Refused by security policy", body: "This server version was refused by a security policy." };
    case "backing_held":
      return { title: "A package it runs is held", body: <>{pkg} is held for review, so the server that runs it is held too.</> };
    case "backing_refused":
      return { title: "A package it runs was refused", body: <>{pkg} was refused by a security policy, so the server that runs it is held.</> };
    case "age_gate":
      return {
        title: "A package it runs is too new",
        body: (
          <>
            {pkg} is newer than the age policy allows{ageText(p)}. {ageGateNext(p)}
          </>
        ),
      };
    case "server_age_gate":
      return {
        title: "This server version is too new",
        body: (
          <>
            This version was published upstream more recently than the age policy allows{ageText(p)}.{" "}
            {ageGateNext(p)}
          </>
        ),
      };
    case "unresolvable":
      return {
        title: "Pinned package is gone",
        body: (
          <>
            {pkg} is no longer available where it was pinned, or the repository&apos;s package policy changed. Publish
            the server again as a new version.
          </>
        ),
      };
    case "resolving":
      return { title: "Still resolving", body: "Artifact Keeper is still resolving the packages of this version. Try again shortly." };
    case "curation":
      return {
        title: "Awaiting approval",
        body: (
          <>
            This server is waiting for an administrator to approve it in this registry. {curationLink(repoKey)}
          </>
        ),
      };
    case "curation_rejected":
      return {
        title: "Not approved",
        body: (
          <>
            An administrator rejected this server in this registry, so none of its versions are served until it is
            approved. {curationLink(repoKey)}
          </>
        ),
      };
    case "content_drift":
      return {
        title: "Changed upstream after approval",
        body: (
          <>
            The upstream registry changed this version&apos;s server.json after it was approved. The approval was
            revoked and the version is back in review. {curationLink(repoKey)}
          </>
        ),
      };
    default:
      return { title: "Held", body: "Artifact Keeper is not serving this version." };
  }
}

function Panel({ tone, children }: { tone: "amber" | "neutral" | "red"; children: ReactNode }) {
  const toneClass = {
    amber: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
    neutral: "border-border bg-muted/40",
    red: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
  }[tone];
  return (
    <section aria-labelledby="mcp-held-heading" className={`rounded-lg border p-4 text-sm space-y-2 ${toneClass}`} data-testid="mcp-held-panel">
      <h2 id="mcp-held-heading" className="flex items-center gap-2 font-medium">
        <CircleHelp className="size-4" aria-hidden="true" />
        Why can&apos;t my client see this?
      </h2>
      {children}
    </section>
  );
}

export function McpHeldVersionPanel({
  repoKey,
  name,
  version,
  read,
}: {
  repoKey: string;
  name: string;
  version: string;
  read: McpVersionRead;
}) {
  if (read.kind === "served") return null;
  const label = (
    <span className="font-mono text-xs">
      {name} {version}
    </span>
  );

  if (read.kind === "unavailable") {
    return (
      <Panel tone="red">
        <p>
          The registry could not check whether {label} may be served, so it refused the read (503) for every
          client. Nothing is served while the check is unavailable. Retry in a moment.
        </p>
      </Panel>
    );
  }

  if (read.kind === "hidden") {
    return (
      <Panel tone="neutral">
        <p>
          The registry does not serve {label}. It may be held, deleted or not exist; clients get the same plain 404
          in every case. Only a holder of this repository can see why.
        </p>
      </Panel>
    );
  }

  const reason = reasonOf(read.problem, repoKey);
  return (
    <Panel tone="amber">
      <p className="font-medium" data-testid="mcp-held-reason">
        {reason.title}
      </p>
      <p>{reason.body}</p>
      {read.problem.detail && <p className="text-muted-foreground">{read.problem.detail}</p>}
      <p className="text-muted-foreground">
        Clients get a plain 404 for {label}, identical to a name that does not exist, so VS Code treats the server as
        not in the registry. Releasing the hold restores the version on the next read.
      </p>
    </Panel>
  );
}
