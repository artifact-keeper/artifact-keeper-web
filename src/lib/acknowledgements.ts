/**
 * What the UI says about an acknowledgement decision (backend 1.12.0,
 * artifact-keeper#5224). An acknowledgement is a decision about these bytes in
 * a repository, not a flag on a row, so a scan has a repository it is being
 * looked at through, and a revoke can leave copies in force.
 */
import { toast } from "sonner";

import type { ScanResult } from "@/types/security";

/**
 * Where a scan row opens.
 *
 * A reused row reports its SOURCE's id (backend #1373), so the id alone means
 * the source's rows in the source's repository. The link has to carry which
 * copy was clicked, or the page acts on a repository the user was not looking
 * at. A scan that is its own row needs nothing more than its id.
 */
export function scanDetailHref(
  scan: Pick<ScanResult, "id" | "artifact_id" | "repository_id" | "is_reused">,
): string {
  const base = `/security/scans/${scan.id}`;
  if (!scan.is_reused) return base;
  const query = new URLSearchParams({
    artifact_id: scan.artifact_id,
    repository_id: scan.repository_id,
  });
  return `${base}?${query.toString()}`;
}

export interface RevokeOutcome {
  /** False when a success message would be untrue. */
  complete: boolean;
  message: string;
}

/**
 * The answer of a revoke by finding or by CVE.
 *
 * `leftEffective` is `acknowledgements_left_effective`: copies of the decision
 * in repositories this credential has no authority over. Null or undefined on a
 * backend that does not report it, which says nothing either way.
 */
export function describeRevoke({
  leftEffective,
  stillAcknowledged,
}: {
  leftEffective: number | null | undefined;
  stillAcknowledged: boolean;
}): RevokeOutcome {
  if (stillAcknowledged) {
    return {
      complete: false,
      message:
        "This finding is still acknowledged here. Another decision may cover it; check Acknowledgements under Security.",
    };
  }
  const left = leftEffective ?? 0;
  if (left > 0) {
    const copies = left === 1 ? "1 copy of this decision stays" : `${left} copies of this decision stay`;
    return {
      complete: false,
      message: `Revoked here, but the risk remains accepted elsewhere: ${copies} in force in repositories this account cannot act for. An administrator with access to them has to revoke those.`,
    };
  }
  return { complete: true, message: "Acknowledgment revoked." };
}

/**
 * The answer of `DELETE /security/acknowledgements/{id}`.
 *
 * Its `left_effective` counts more than copies elsewhere: it includes a separate
 * decision for every repository that still covers the finding, which can be in
 * force in the very repository this decision applied in. So this never says
 * "elsewhere".
 */
export function describeRevokeById({
  revoked,
  left_effective,
}: {
  revoked: number;
  left_effective: number;
}): RevokeOutcome {
  if (left_effective > 0) {
    const others =
      left_effective === 1 ? "1 other decision stays" : `${left_effective} other decisions stay`;
    return {
      complete: false,
      message: `The risk remains accepted: ${others} in force. That can be a copy in a repository this account cannot act for, or a separate decision for every repository.`,
    };
  }
  if (revoked === 0) {
    return {
      complete: false,
      message: "Nothing was revoked: this decision was already revoked.",
    };
  }
  return { complete: true, message: "Decision revoked." };
}

/**
 * A partial revoke stays on screen until it is dismissed. It is the one thing
 * the user must not miss: they believe they ended a risk that is still accepted.
 */
export function reportRevokeOutcome(outcome: RevokeOutcome): void {
  if (outcome.complete) {
    toast.success(outcome.message);
    return;
  }
  toast.warning(outcome.message, { duration: Infinity, closeButton: true });
}
