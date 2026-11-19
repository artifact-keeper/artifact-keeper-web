"use client";

import { CheckCircle, XCircle } from "lucide-react";

import type {
  BulkPromotionResponse,
  PromotionResponse,
  PromotionScanState,
} from "@/types/promotion";
import { SEVERITY_COLORS } from "@/types/promotion";
import { Badge } from "@/components/ui/badge";

/** Human label for a gate rule id; unknown ids are shown as sent. */
const GATE_LABELS: Record<string, string> = {
  // Rule tokens the backend reports (promotion_policy_service / promotion).
  "require-signature": "Verified signature or attestation",
  "cve-severity-threshold": "Vulnerability scan",
  "default-cve-policy": "Vulnerability scan (default policy)",
  "block-unscanned": "Scanned before promotion",
  "max-severity": "Vulnerability severity",
  "license-compliance": "License allowed",
  "max-artifact-age": "Artifact age",
  "min-staging-time": "Minimum time in staging",
  "policy-predicate": "Scan policy predicate",
};

export function gateLabel(rule: string): string {
  return GATE_LABELS[rule] ?? rule.replace(/[-_]/g, " ");
}

/** Whether a bulk result has anything worth keeping the dialog open for. */
export function promotionNeedsReview(result: BulkPromotionResponse): boolean {
  return (
    result.failed > 0 ||
    (result.results ?? []).some(
      (r) =>
        (r.gate_results?.length ?? 0) > 0 ||
        r.policy_violations.length > 0 ||
        // The artifact is promoted either way, so a verdict that did not travel
        // or a decision left behind would otherwise vanish with the dialog.
        (r.scan_state != null &&
          (!r.scan_state.verdict_carried || r.scan_state.acknowledgements_left_behind > 0)),
    )
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Whether the source's scan verdict and decisions followed the bytes (#1072). */
function ScanStateOutcome({ state }: { state: PromotionScanState }) {
  return (
    <div className="space-y-1 text-xs" data-testid="promotion-scan-state">
      {state.verdict_carried ? (
        <p className="text-muted-foreground">Scan verdict carried to the target.</p>
      ) : (
        <p className="text-amber-700 dark:text-amber-400">
          Scan verdict not carried
          {state.verdict_not_carried_reason ? `: ${state.verdict_not_carried_reason}` : ""}. The
          target sees this artifact as unscanned, so a target policy with block_unscanned refuses
          it until it is scanned there.
        </p>
      )}
      {state.acknowledgements_carried > 0 && (
        <p className="text-muted-foreground">
          {plural(state.acknowledgements_carried, "acknowledgement")} carried.
        </p>
      )}
      {state.acknowledgements_left_behind > 0 && (
        <p className="text-amber-700 dark:text-amber-400">
          {plural(state.acknowledgements_left_behind, "acknowledgement")} left behind: those
          findings are open in the target, and its policy decides.
        </p>
      )}
    </div>
  );
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

/** The most severe violation reported under a gate's rule, if any. */
export function worstSeverity(
  result: PromotionResponse,
  rule: string,
): (typeof SEVERITY_ORDER)[number] | undefined {
  const found = new Set(result.policy_violations.filter((v) => v.rule === rule).map((v) => v.severity));
  return SEVERITY_ORDER.find((s) => found.has(s));
}

function ArtifactOutcome({ result }: { result: PromotionResponse }) {
  const gates = result.gate_results;
  // A failed gate already carries its violations' messages as its reason
  // (backend build_gate_results), so list separately only the violations no
  // gate row covers; older backends send no gates and get the full list.
  const gatedRules = new Set((gates ?? []).map((g) => g.rule));
  const ungated = result.policy_violations.filter((v) => !gatedRules.has(v.rule));
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
              {!g.passed && worstSeverity(result, g.rule) && (
                <Badge
                  className={`shrink-0 text-[10px] ${SEVERITY_COLORS[worstSeverity(result, g.rule)!]}`}
                >
                  {worstSeverity(result, g.rule)}
                </Badge>
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
      {ungated.length > 0 && (
        <ul className="space-y-1" data-testid="promotion-violations">
          {ungated.map((v, i) => (
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
      {result.promoted && result.scan_state && <ScanStateOutcome state={result.scan_state} />}
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
