"use client";

import { CheckCircle, XCircle } from "lucide-react";

import type { BulkPromotionResponse, PromotionResponse } from "@/types/promotion";
import { SEVERITY_COLORS } from "@/types/promotion";
import { Badge } from "@/components/ui/badge";

/** Human label for a gate rule id; unknown ids are shown as sent. */
const GATE_LABELS: Record<string, string> = {
  attestation: "Verified attestation",
  require_signature: "Verified attestation",
  min_attestation_state: "Verified attestation",
  vulnerability_scan: "Vulnerability scan",
  scan: "Vulnerability scan",
  license: "License allowed",
  license_policy: "License allowed",
  "policy-predicate": "Scan policy predicate",
};

export function gateLabel(rule: string): string {
  return GATE_LABELS[rule] ?? rule.replace(/_/g, " ");
}

/** Whether a bulk result has anything worth keeping the dialog open for. */
export function promotionNeedsReview(result: BulkPromotionResponse): boolean {
  return (
    result.failed > 0 ||
    (result.results ?? []).some(
      (r) => (r.gate_results?.length ?? 0) > 0 || r.policy_violations.length > 0,
    )
  );
}

function ArtifactOutcome({ result }: { result: PromotionResponse }) {
  const gates = result.gate_results;
  return (
    <li className="rounded-md border p-3 space-y-2" data-testid="promotion-outcome">
      <div className="flex items-start justify-between gap-2">
        <code className="text-xs break-all">{result.source}</code>
        {result.promoted ? (
          <Badge className="shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            Promoted
          </Badge>
        ) : (
          <Badge className="shrink-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Refused
          </Badge>
        )}
      </div>
      {gates && gates.length > 0 && (
        <ul className="space-y-1">
          {gates.map((g, i) => (
            <li key={`${g.rule}-${i}`} className="flex items-start gap-2 text-xs">
              {g.passed ? (
                <CheckCircle
                  className="size-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-label="passed"
                />
              ) : (
                <XCircle
                  className="size-3.5 mt-0.5 shrink-0 text-red-600 dark:text-red-400"
                  aria-label="failed"
                />
              )}
              <span>
                <span className="font-medium">{gateLabel(g.rule)}</span>
                {g.reason && <span className="text-muted-foreground">: {g.reason}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* Per-violation rule and severity (#917): the quality gate, CVE and
          licence policy, and the scan-policy predicates (`policy-predicate`)
          all report here, on bulk promotion as on single. */}
      {result.policy_violations.length > 0 && (
        <ul className="space-y-1" data-testid="promotion-violations">
          {result.policy_violations.map((v, i) => (
            <li key={`${v.rule}-${i}`} className="flex items-start gap-2 text-xs">
              <Badge className={`shrink-0 text-[10px] ${SEVERITY_COLORS[v.severity]}`}>
                {v.severity}
              </Badge>
              <span>
                <span className="font-medium">{gateLabel(v.rule)}</span>
                <span className="text-muted-foreground">: {v.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!gates?.length && result.policy_violations.length === 0 && result.message && (
        <p className="text-xs text-muted-foreground">{result.message}</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Target: <code>{result.target}</code>
      </p>
    </li>
  );
}

/**
 * The promotion dialog's result view: per artifact, whether it was promoted
 * and each gate's decision with its reason (backend 1.11.0 `gate_results`),
 * falling back to the response message and policy violations.
 */
export function PromotionResult({ result }: { result: BulkPromotionResponse }) {
  return (
    <div className="space-y-3" data-testid="promotion-result">
      <p className="text-sm">
        Promoted {result.promoted} of {result.total}
        {result.failed > 0 && <span className="text-destructive"> ({result.failed} refused)</span>}
      </p>
      <ul className="space-y-2">
        {(result.results ?? []).map((r, i) => (
          <ArtifactOutcome key={`${r.source}-${i}`} result={r} />
        ))}
      </ul>
    </div>
  );
}
