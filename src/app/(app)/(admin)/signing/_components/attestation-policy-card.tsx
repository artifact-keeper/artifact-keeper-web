"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { attestationPolicyApi } from "@/lib/api/attestation-policy";
import { ApiError } from "@/lib/api/fetch";
import { toUserMessage } from "@/lib/error-utils";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start text-sm">
      <span className="text-xs font-medium text-muted-foreground pt-0.5">{label}</span>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i} className="font-mono text-xs">{i}</li>
      ))}
    </ul>
  );
}

/**
 * Read-only view of the attestation trust policy: which publish attestations
 * the registry accepts as verified on upload (backend 1.11.0).
 */
export function AttestationPolicyCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["attestation-policy"],
    queryFn: () => attestationPolicyApi.get(),
    retry: false,
  });

  return (
    <Card data-testid="attestation-policy-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          Attestation trust policy
        </CardTitle>
        <CardDescription>
          Which publish attestations (Sigstore bundles, e.g. conda CEP-27) the
          registry verifies on upload. Set in server configuration; shown
          read-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : error ? (
          <p className="text-sm text-muted-foreground" role="status">
            {error instanceof ApiError && (error.status === 404 || error.status === 405)
              ? "This backend does not report an attestation trust policy (backend 1.11.0 and later)."
              : toUserMessage(error, "Could not load the attestation trust policy")}
          </p>
        ) : data ? (
          <>
            <Row label="Uploads">
              {data.require_verified ? (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  Verified attestation required
                </Badge>
              ) : (
                <Badge variant="outline">Unverified attestations accepted</Badge>
              )}
            </Row>
            <Row label="Trusted keys">
              {data.keys.length === 0 ? (
                <span className="text-muted-foreground">No keys: key-signed bundles are refused</span>
              ) : (
                <ul className="space-y-1.5">
                  {data.keys.map((k) => (
                    <li key={k.id}>
                      <span className="font-medium">{k.name ?? k.id}</span>
                      {k.algorithm && (
                        <Badge variant="outline" className="ml-2 text-[11px] uppercase">{k.algorithm}</Badge>
                      )}
                      {k.fingerprint && (
                        <div className="font-mono text-xs text-muted-foreground">{k.fingerprint}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Row>
            <Row label="OIDC issuers">
              <List items={data.issuers} empty="None: keyless bundles are refused" />
            </Row>
            <Row label="Identities">
              <List items={data.identities} empty="Any identity from a trusted issuer" />
            </Row>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
