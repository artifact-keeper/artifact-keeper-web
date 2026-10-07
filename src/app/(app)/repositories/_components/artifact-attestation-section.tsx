"use client";

import { ShieldCheck, ShieldAlert, ShieldQuestion, Download, FileSignature } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  attestationMethodLabel,
  readAttestation,
  type AttestationState,
} from "@/lib/attestation";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
      <span className="text-muted-foreground text-xs font-medium pt-0.5">{label}</span>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  );
}

const STATE_BADGE: Record<
  AttestationState,
  { label: string; className: string; Icon: typeof ShieldCheck }
> = {
  verified: {
    label: "Verified",
    className:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900",
    Icon: ShieldCheck,
  },
  failed: {
    label: "Verification failed",
    className:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900",
    Icon: ShieldAlert,
  },
  unverified: {
    label: "Not verified",
    className:
      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900",
    Icon: ShieldQuestion,
  },
  none: {
    label: "No attestation",
    className: "bg-muted text-muted-foreground",
    Icon: ShieldQuestion,
  },
};

/**
 * The "Attestation" block of the artifact detail dialog: the registry's
 * verification of the package's publish attestation (CEP-27, a Sigstore
 * bundle), and links to the CEP-50 `.sigs` sidecar and the stored bundle.
 *
 * `repoKey` and `path` build the conda channel URLs; the links are offered
 * only for conda packages (`channel` set), since only the conda router serves
 * them. The block always renders for conda, so "no attestation" is visible
 * rather than silently absent.
 */
export function ArtifactAttestationSection({
  metadata,
  channel,
}: {
  metadata: Record<string, unknown> | null | undefined;
  /** Conda channel coordinates; omit for formats without sidecars. */
  channel?: { repoKey: string; path: string };
}) {
  const att = readAttestation(metadata);
  const badge = STATE_BADGE[att.state];
  const keyBased = att.method === "sigstore-key";
  const base = channel
    ? `/conda/${encodeURIComponent(channel.repoKey)}/${channel.path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`
    : null;

  return (
    <div className="space-y-3" data-testid="artifact-attestation">
      <p className="text-xs font-medium text-muted-foreground">Attestation</p>
      <Row label="Status">
        <Badge variant="outline" className={`gap-1 ${badge.className}`}>
          <badge.Icon className="size-3.5" />
          {badge.label}
        </Badge>
      </Row>
      {att.state === "none" && (
        <p className="text-xs text-muted-foreground">
          No publish attestation is stored for this package. Consumers that
          require one will refuse it, and promotion rules that require a
          verified attestation will not pass it.
        </p>
      )}
      {att.method && <Row label="Method">{attestationMethodLabel(att.method)}</Row>}
      {/* A key-signed bundle has no certificate: the backend records the
          trusted key's configured name as `identity` and `key:<id>` as
          `issuer`, so show them as the key rather than as an OIDC identity. */}
      {att.identity && (
        <Row label={keyBased ? "Key name" : "Identity"}>
          <span className="font-mono text-xs">{att.identity}</span>
        </Row>
      )}
      {att.keyFingerprint && (
        <Row label="Key fingerprint">
          <span className="font-mono text-xs">{att.keyFingerprint}</span>
        </Row>
      )}
      {att.issuer && !(keyBased && att.issuer.startsWith("key:")) && (
        <Row label="Issuer">
          <span className="font-mono text-xs">{att.issuer}</span>
        </Row>
      )}
      {att.verifiedAt && (
        <Row label="Verified at">
          <span title={att.verifiedAt}>{new Date(att.verifiedAt).toLocaleString()}</span>
        </Row>
      )}
      {att.error && att.state !== "verified" && (
        <Row label="Reason">
          <span className="text-xs text-destructive">{att.error}</span>
        </Row>
      )}
      {base && att.hasBundle && (
        <Row label="Files">
          <div className="flex flex-wrap gap-3 text-xs">
            <a
              href={`${base}.sigs`}
              className="inline-flex items-center gap-1 underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              <FileSignature className="size-3.5" />
              .sigs sidecar (CEP-50)
            </a>
            <a
              href={`${base}/attestation`}
              className="inline-flex items-center gap-1 underline underline-offset-2"
              download
            >
              <Download className="size-3.5" />
              Sigstore bundle
            </a>
          </div>
        </Row>
      )}
    </div>
  );
}
