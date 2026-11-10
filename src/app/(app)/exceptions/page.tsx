"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Loader2,
  Infinity as InfinityIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  exceptionsApi,
  EXCEPTION_GATES,
  EXCEPTION_STATUSES,
  DEFAULT_EXPIRY_DAYS,
  type PackageException,
  type ExceptionGate,
  type ExceptionStatus,
} from "@/lib/api/exceptions";
import {
  RequireCapability,
  CAP_SECURITY_REVIEW,
} from "@/components/auth/require-capability";
import { mutationErrorToast, toUserMessage } from "@/lib/error-utils";
import { ApiError } from "@/lib/api/fetch";
import { useAuth } from "@/providers/auth-provider";
import { formatDate } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/lib/api/admin";
import { ageGateApi } from "@/lib/api/age-gate";
import Link from "next/link";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ListTruncationNotice } from "@/components/common/list-truncation-notice";
import { useSecurityReviewers } from "@/components/common/security-reviewer-switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/** Sentinel for "no filter"; a Radix SelectItem cannot hold "". */
const ALL = "__all__";

/** Plain-language label for each gate, since `scan` alone is ambiguous. */
const GATE_LABEL: Record<ExceptionGate, string> = {
  age: "Age gate",
  scan: "Scan gate",
  curation: "Curation rule",
};

/**
 * Spelled out rather than CSS `capitalize`: the trigger renders the selected
 * item's text WITHOUT the item's class, so a capitalized menu entry still
 * showed up lowercase once chosen.
 */
const STATUS_LABEL: Record<ExceptionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** Who put the row in the queue, as a filter the reviewer picks. */
const ORIGIN_FILTERS = ["all", "requested", "attempted"] as const;
type OriginFilter = (typeof ORIGIN_FILTERS)[number];
const ORIGIN_LABEL: Record<OriginFilter, string> = {
  all: "All requests",
  requested: "User requested only",
  attempted: "Gate attempted only",
};

const GATE_HELP: Record<ExceptionGate, string> = {
  age: "Published more recently than the repository's minimum age.",
  scan: "An inline vulnerability scan found findings at or above the repository's threshold.",
  curation: "A curation rule refuses this package.",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  approved: "secondary",
  rejected: "destructive",
};

/** What an approval will actually grant, said before the reviewer commits. */
function describeGrant(neverExpires: boolean, days: number): string {
  if (neverExpires) {
    return "This serves the package indefinitely. Nothing will bring it back for review, so prefer a window unless the risk is genuinely permanent.";
  }
  return `This serves the package for ${days} day${days === 1 ? "" : "s"}, then it is withheld again and returns to this queue.`;
}

/** Longest grant the backend accepts, and the field's own upper bound. */
const MAX_EXPIRY_DAYS = 3650;

/** Milliseconds for an ISO instant, 0 for one the backend sent malformed. */
function instant(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Expiry is evaluated on read, with no sweeper, so a lapsed row keeps
 * `status = approved` while the gate has already started withholding again.
 * Rendering it as still-granted would be a lie.
 */
function expired(expiresAt: string | null): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
}

/**
 * The two decisions that apply to a row, in column order.
 *
 * Exactly two always apply -- a pending row cannot be reopened, an approved
 * one cannot be approved again -- so the action cell is two equal slots rather
 * than three conditional ones, and nothing shifts between rows.
 */
function rowActions(status: string): ReadonlyArray<{
  target: "approved" | "rejected" | "pending";
  label: string;
  variant: "default" | "destructive" | "ghost";
}> {
  const grant = { target: "approved", label: "Grant", variant: "default" } as const;
  const refuse = { target: "rejected", label: "Refuse", variant: "destructive" } as const;
  const reopen = { target: "pending", label: "Reopen", variant: "ghost" } as const;
  if (status === "pending") return [grant, refuse];
  if (status === "approved") return [refuse, reopen];
  return [grant, reopen];
}

/**
 * How old the version was when it was first refused. The age gate's own page
 * showed this and nothing else unique; it is the whole decision input for an
 * `age` row, so it moves here rather than being lost when that page goes.
 */
function publishedAge(
  upstreamPublishedAt: string | null,
  requestedAt: string,
): string | null {
  if (!upstreamPublishedAt) return null;
  // Age WHEN IT WAS REFUSED, as the Age Gate page measured it -- not age now.
  // Measuring from now reads as a contradiction on an old row: "32d old (min
  // 7d)" next to a still-blocked package, because the gate only re-evaluates
  // when someone pulls again.
  const days = Math.floor(
    (new Date(requestedAt).getTime() - new Date(upstreamPublishedAt).getTime()) /
      86_400_000,
  );
  if (!Number.isFinite(days) || days < 0) return null;
  return `${days}d old`;
}

/** An exception bound to specific bytes stops applying if those bytes change. */
function digestNote(gate: ExceptionGate | null): string | null {
  if (gate !== "scan") return null;
  return "Bound to the exact bytes that were scanned: if upstream republishes this version, it is blocked again automatically.";
}

/** Who can decide here, for admins, absent on a backend without the reviewer API */
function ReviewersList() {
  const { data } = useSecurityReviewers(true);
  if (!data) return null;
  const who = [
    ...data.users.map(
      (u) => `${u.display_name || u.username}${u.is_active ? "" : " (inactive)"}`,
    ),
    ...data.groups.map(
      (g) =>
        `${g.name} (group, ${g.member_count} member${g.member_count === 1 ? "" : "s"})`,
    ),
  ];
  return (
    <section
      aria-labelledby="exc-reviewers"
      className="rounded-md border px-3 py-2 text-sm"
    >
      <h2 id="exc-reviewers" className="font-medium">
        Reviewers
      </h2>
      <p className="text-xs text-muted-foreground">
        Administrators{who.length ? `, plus ${who.join(", ")}` : " only"}.
        Change it on the{" "}
        <Link href="/users" className="underline">
          Users
        </Link>{" "}
        and{" "}
        <Link href="/groups" className="underline">
          Groups
        </Link>{" "}
        pages.
      </p>
    </section>
  );
}

function ExceptionsQueue() {
  useDocumentTitle("Package Exceptions");
  const queryClient = useQueryClient();
  // Both lookups below are admin-only endpoints. A security reviewer who is
  // not an admin is entitled to the queue but not to them, so they are
  // skipped rather than fired to collect a 403 each.
  const isAdmin = useAuth().user?.is_admin ?? false;

  const [gates, setGates] = useState<ExceptionGate[]>([...EXCEPTION_GATES]);
  const [statuses, setStatuses] = useState<ExceptionStatus[]>(["pending"]);
  // The reviewer's default view is what humans actually asked for. Turning
  // this off widens to every refused pull the gates filed on their own, which
  // is demand signal rather than a request queue.
  const [originFilter, setOriginFilter] = useState<OriginFilter>("requested");
  const justifiedOnly = originFilter === "requested";

  const [decision, setDecision] = useState<
    { row: PackageException; target: "approved" | "rejected" | "pending" } | null
  >(null);
  const [reason, setReason] = useState("");
  const [expiryDays, setExpiryDays] = useState(String(DEFAULT_EXPIRY_DAYS));
  const [neverExpires, setNeverExpires] = useState(false);

  const gateKey = [...gates].sort().join(",");
  const statusKey = [...statuses].sort().join(",");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["exceptions", gateKey, statusKey, originFilter],
    queryFn: () =>
      exceptionsApi.list({
        gates,
        statuses,
        justifiedOnly,
        perPage: 100,
      }),
    enabled: gates.length > 0 && statuses.length > 0,
  });

  // `min Nd` next to the age. Only the age gate has a threshold, so only an
  // `age` row needs the repository's policy looked up.
  const ageRepositoryKeys = useMemo(
    () => [
      ...new Set(
        (data?.items ?? [])
          .filter((r) => r.gate === "age")
          .map((r) => r.repositoryKey),
      ),
    ],
    [data],
  );
  const { data: repoConfigs } = useQuery({
    queryKey: ["exception-repo-configs", ageRepositoryKeys],
    queryFn: () => ageGateApi.getRepoConfigs(ageRepositoryKeys),
    enabled: isAdmin && ageRepositoryKeys.length > 0,
  });

  // A decided row has to say WHO released the package, not an opaque uuid.
  // Only the first page of users is fetched; anyone past it degrades to a
  // shortened id, as does every row for a non-admin reviewer.
  const hasNamedUsers = (data?.items ?? []).some(
    (r) => r.reviewedBy || r.requestedBy,
  );
  const { data: users } = useQuery({
    queryKey: ["exception-users"],
    queryFn: () => adminApi.listUsers({ perPage: 100 }),
    enabled: isAdmin && hasNamedUsers,
  });
  const userNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const u of users ?? []) names[u.id] = u.display_name || u.username;
    return names;
  }, [users]);
  const userName = (id: string) => userNames[id] ?? `${id.slice(0, 8)}\u2026`;

  const rows = useMemo(() => {
    const all = data?.items ?? [];
    // No server-side "attempted only", so narrow the unfiltered list here.
    const narrowed =
      originFilter === "attempted"
        ? all.filter((r) => r.origin === "attempted")
        : all;
    // The list endpoint promises no order. Most recently demanded first is
    // the triage order, and the id tiebreak keeps the table from reshuffling
    // under the reviewer between refetches.
    return [...narrowed].sort(
      (a, b) =>
        instant(b.lastRequestedAt) - instant(a.lastRequestedAt) ||
        a.id.localeCompare(b.id),
    );
  }, [data, originFilter]);

  // One coordinate can be refused by more than one gate, and each files its
  // OWN row. Approving one lifts only that gate, so a reviewer needs to see
  // the siblings or they will believe they have released the package.
  const byCoord = useMemo(() => {
    const m = new Map<string, PackageException[]>();
    for (const r of rows) {
      const k = `${r.repositoryKey}\u0000${r.packageName}\u0000${r.packageVersion}`;
      const at = m.get(k);
      if (at) at.push(r);
      else m.set(k, [r]);
    }
    return m;
  }, [rows]);

  /**
   * Gates that would still withhold this coordinate after approving `r`.
   * Only sees rows the current filter loaded, so this is additive information:
   * an empty result never means "nothing else blocks it".
   */
  const stillBlockedBy = (r: PackageException): ExceptionGate[] =>
    (byCoord.get(`${r.repositoryKey}\u0000${r.packageName}\u0000${r.packageVersion}`) ?? [])
      .filter((o) => o.id !== r.id && o.gate !== null && o.status !== "approved")
      .map((o) => o.gate as ExceptionGate);

  const closeDialog = () => {
    setDecision(null);
    setReason("");
    setExpiryDays(String(DEFAULT_EXPIRY_DAYS));
    setNeverExpires(false);
  };

  const decide = useMutation({
    mutationFn: async ({
      row,
      target,
      why,
    }: {
      row: PackageException;
      target: "approved" | "rejected" | "pending";
      why: string;
    }) => {
      if (target === "approved") {
        const days = Number.parseInt(expiryDays, 10);
        return exceptionsApi.approve(row.id, {
          reason: why,
          neverExpires,
          expiresInDays: neverExpires ? undefined : days,
        });
      }
      if (target === "rejected") return exceptionsApi.reject(row.id, why);
      return exceptionsApi.reopen(row.id, why);
    },
    onSuccess: (_r, { row, target }) => {
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      closeDialog();
      const verb =
        target === "approved"
          ? "Granted"
          : target === "rejected"
            ? "Refused"
            : "Returned to pending";
      toast.success(`${verb} ${row.packageName}@${row.packageVersion}`);
    },
    onError: mutationErrorToast("Could not record the decision"),
  });

  // A GRANT always needs a reason: it is the one action that widens what the
  // estate serves, and the queue exists to record why. Reversing a recorded
  // decision needs one too. The backend enforces the grant case as well, so
  // this is the friendly half of the same rule, not the rule itself.
  const reasonRequired =
    decision !== null &&
    (decision.target === "approved" || decision.row.status !== "pending");
  const reasonMissing = reasonRequired && reason.trim() === "";

  const parsedDays = Number.parseInt(expiryDays, 10);
  const expiryInvalid =
    decision?.target === "approved" &&
    !neverExpires &&
    (!Number.isFinite(parsedDays) ||
      parsedDays < 1 ||
      parsedDays > MAX_EXPIRY_DAYS);

  // A backend without the exception queue 404s the list route. That is not a
  // broken page, so it gets its own copy rather than a retry button that can
  // never succeed.
  const queueUnavailable = error instanceof ApiError && error.status === 404;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-6" />
        <div>
          <h1 className="text-xl font-semibold">Package Exceptions</h1>
          <p className="text-sm text-muted-foreground">
            Packages a gate is withholding. Grant an exception to release one,
            with an expiry so the risk gets looked at again.
          </p>
        </div>
      </div>

      {isAdmin && <ReviewersList />}

      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={
            gates.length === EXCEPTION_GATES.length ? ALL : (gates[0] ?? ALL)
          }
          onValueChange={(v) =>
            setGates(v === ALL ? [...EXCEPTION_GATES] : [v as ExceptionGate])
          }
        >
          <SelectTrigger className="w-[190px]" aria-label="Why blocked">
            <SelectValue placeholder="Why blocked" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All reasons</SelectItem>
            {EXCEPTION_GATES.map((g) => (
              <SelectItem key={g} value={g} title={GATE_HELP[g]}>
                {GATE_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={
            statuses.length === EXCEPTION_STATUSES.length
              ? ALL
              : (statuses[0] ?? ALL)
          }
          onValueChange={(v) =>
            setStatuses(
              v === ALL ? [...EXCEPTION_STATUSES] : [v as ExceptionStatus],
            )
          }
        >
          <SelectTrigger className="w-[160px]" aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {EXCEPTION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={originFilter}
          onValueChange={(v) => setOriginFilter(v as OriginFilter)}
        >
          <SelectTrigger className="w-[200px]" aria-label="Requested by">
            <SelectValue placeholder="Requested by" />
          </SelectTrigger>
          <SelectContent>
            {ORIGIN_FILTERS.map((o) => (
              <SelectItem key={o} value={o}>
                {ORIGIN_LABEL[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" role="status" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!isLoading && isError && queueUnavailable && (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>
            This server does not have the package exception queue. It arrives
            with the backend that serves <code>/api/v1/exceptions</code>;
            until then, age-gate reviews are decided on the Age Gate page.
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && isError && !queueUnavailable && (
        <div
          className="flex flex-col items-center justify-center py-12 text-center"
          role="alert"
        >
          <AlertCircle className="mb-2 size-8 text-destructive opacity-80" />
          <p className="text-sm font-medium">Couldn&apos;t load the queue</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {toUserMessage(error, "Unknown error")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="space-y-2 rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          <p>
            {originFilter === "requested"
              ? "No user-requested exceptions match these filters. Switch “User requested only” to “All requests” to see packages the gates refused without anyone asking."
              : originFilter === "attempted"
                ? "No gate-filed refusals match these filters."
                : "No packages match these filters."}
          </p>
          <p>
            <Link href="/exceptions/request" className="underline">
              Ask for a package that is not listed
            </Link>
          </p>
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <>
          <ListTruncationNotice shown={rows.length} total={data?.total ?? 0} />
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Packages a gate is withholding, with the recorded decision for
                each.
              </caption>
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Package</th>
                  <th className="px-3 py-2 font-medium">Repository</th>
                  <th className="px-3 py-2 font-medium">Why blocked</th>
                  <th className="px-3 py-2 font-medium">Asked</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Decision</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const age = publishedAge(r.upstreamPublishedAt, r.requestedAt);
                  const alsoBlocked = stillBlockedBy(r);
                  return (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.packageName}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.packageVersion}
                      </div>
                      {age && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {age}
                          {r.gate === "age" &&
                            repoConfigs?.[r.repositoryKey]?.minAgeDays !==
                              undefined &&
                            ` (min ${repoConfigs[r.repositoryKey].minAgeDays}d)`}
                        </div>
                      )}
                      {r.justification && (
                        <div className="mt-1 max-w-md text-xs italic text-muted-foreground">
                          &ldquo;{r.justification}&rdquo;
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {/* Deep-link to where this repository's gates are
                          configured, as the Age Gate page did (#701). */}
                      <Link
                        href={`/repositories/${encodeURIComponent(r.repositoryKey)}?tab=settings`}
                        title={`Settings for ${r.repositoryKey}`}
                      >
                        <Badge variant="outline">{r.repositoryKey}</Badge>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {/* A scan-gate row has evidence worth reading, so the
                          badge opens it. Proxy-cached bytes carry no artifacts
                          row, so their verdicts are only reachable through the
                          repository's proxy-scan panel (#3344) -- the findings
                          themselves load there when a path is opened. */}
                      {r.gate === "scan" ? (
                        <Link
                          href={`/repositories/${encodeURIComponent(r.repositoryKey)}?tab=security`}
                          title={`${GATE_HELP.scan} Opens the scan findings for ${r.repositoryKey}.`}
                        >
                          <Badge
                            variant="outline"
                            className="hover:bg-accent hover:underline"
                          >
                            {GATE_LABEL.scan}
                          </Badge>
                        </Link>
                      ) : (
                        <Badge
                          variant="outline"
                          title={r.gate ? GATE_HELP[r.gate] : undefined}
                        >
                          {r.gate ? GATE_LABEL[r.gate] : "unknown"}
                        </Badge>
                      )}
                      {alsoBlocked.length > 0 && (
                        <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-500">
                          Also blocked by{" "}
                          {alsoBlocked.map((g) => GATE_LABEL[g]).join(", ")}.
                          Each gate is excepted separately, so granting this
                          row does not lift the others.
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={r.origin === "requested" ? "default" : "outline"}
                      >
                        {r.origin === "requested" ? "Requested" : "Attempted"}
                      </Badge>
                      {r.requestedBy && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          by {userName(r.requestedBy)}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {r.requestCount}&times; &middot;{" "}
                        <span title={r.lastRequestedAt}>
                          {formatDate(r.lastRequestedAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                        {STATUS_LABEL[r.status as ExceptionStatus] ?? r.status}
                      </Badge>
                      {/* Only an approval has an expiry -- a request carries
                          none, the reviewer sets it when deciding -- so this
                          lives with the status instead of in a column that was
                          empty for every pending row. */}
                      {r.status === "approved" && (
                        <div
                          className={`mt-1 text-xs ${
                            expired(r.expiresAt)
                              ? "font-medium text-amber-600 dark:text-amber-500"
                              : "text-muted-foreground"
                          }`}
                          title={r.expiresAt ?? undefined}
                        >
                          {!r.expiresAt
                            ? "never expires"
                            : expired(r.expiresAt)
                              ? `expired ${formatDate(r.expiresAt)}`
                              : `until ${formatDate(r.expiresAt)}`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {/* The attribution the Age Gate page carried: a released
                          package has to name who released it, when, and why.
                          A reopened row keeps reviewed_by/at pointing at
                          whoever reopened it, so only decided rows show it. */}
                      {r.status !== "pending" &&
                      (r.reviewedBy || r.reviewedAt || r.reviewReason) ? (
                        <div className="max-w-xs space-y-0.5">
                          {(r.reviewedBy || r.reviewedAt) && (
                            <div>
                              {r.reviewedByUsername ??
                                (r.reviewedBy
                                  ? userName(r.reviewedBy)
                                  : "Unknown reviewer")}
                              {r.reviewedAt && (
                                <span title={r.reviewedAt}>
                                  {" "}
                                  on {formatDate(r.reviewedAt)}
                                </span>
                              )}
                            </div>
                          )}
                          {r.reviewReason && (
                            <div className="italic">
                              &ldquo;{r.reviewReason}&rdquo;
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">
                          {r.origin === "requested"
                            ? "Awaiting review"
                            : "Nobody has asked"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {/* Exactly two decisions apply to any row, so two equal
                          slots keep them aligned down the table with no holes
                          and no placeholder. */}
                      <div className="flex items-center justify-end gap-2">
                        {rowActions(r.status).map((a) => (
                          <Button
                            key={a.target}
                            size="sm"
                            variant={a.variant}
                            className="w-[4.75rem]"
                            // Every row repeats these two words, so the
                            // accessible name carries the coordinate.
                            aria-label={`${a.label} ${r.packageName}@${r.packageVersion}`}
                            onClick={() =>
                              setDecision({ row: r, target: a.target })
                            }
                          >
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={decision !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.target === "approved"
                ? "Grant an exception"
                : decision?.target === "rejected"
                  ? "Refuse this package"
                  : "Reopen this decision"}
            </DialogTitle>
            <DialogDescription>
              {decision
                ? `${decision.row.packageName}@${decision.row.packageVersion} in ${decision.row.repositoryKey}.`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {decision?.target === "approved" && (
              <div className="space-y-2">
                <Label htmlFor="exc-expiry">Expires after (days)</Label>
                <Input
                  id="exc-expiry"
                  type="number"
                  min={1}
                  max={MAX_EXPIRY_DAYS}
                  value={expiryDays}
                  disabled={neverExpires}
                  aria-invalid={expiryInvalid}
                  aria-describedby={
                    expiryInvalid ? "exc-expiry-error" : undefined
                  }
                  onChange={(e) => setExpiryDays(e.target.value)}
                />
                {expiryInvalid && (
                  <p
                    id="exc-expiry-error"
                    role="alert"
                    className="text-xs text-destructive"
                  >
                    Enter a whole number of days from 1 to {MAX_EXPIRY_DAYS},
                    or grant it permanently with Never expires.
                  </p>
                )}
                <Button
                  type="button"
                  variant={neverExpires ? "default" : "outline"}
                  size="sm"
                  aria-pressed={neverExpires}
                  onClick={() => setNeverExpires((v) => !v)}
                >
                  <InfinityIcon className="size-4 mr-1.5" />
                  Never expires
                </Button>
                {!expiryInvalid && (
                  <p className="text-xs text-muted-foreground">
                    {describeGrant(neverExpires, parsedDays)}
                  </p>
                )}
                {digestNote(decision.row.gate) && (
                  <p className="text-xs text-muted-foreground">
                    {digestNote(decision.row.gate)}
                  </p>
                )}
                {/* Stated unconditionally: the row hint below only sees what
                    the current filter loaded, so silence there must never read
                    as "nothing else is blocking this". */}
                <p className="text-xs text-muted-foreground">
                  Scoped to{" "}
                  <span className="font-medium">
                    {decision.row.gate ? GATE_LABEL[decision.row.gate] : "this gate"}
                  </span>{" "}
                  only. Every gate is excepted separately, so this does not
                  release the version from the others.
                </p>
                {stillBlockedBy(decision.row).length > 0 && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                    Still withheld after this by{" "}
                    {stillBlockedBy(decision.row)
                      .map((g) => GATE_LABEL[g])
                      .join(", ")}
                    . Approving here will not make the version downloadable.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="exc-reason">
                Reason {reasonRequired ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                id="exc-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={reasonMissing}
                aria-describedby={reasonRequired ? "exc-reason-why" : undefined}
                placeholder="Recorded in the audit log"
              />
              {reasonRequired && (
                <p id="exc-reason-why" className="text-xs text-muted-foreground">
                  {decision?.row.status === "pending"
                    ? "A grant is the one action that widens what this instance serves, so the audit log records why."
                    : "This reverses a decision that is already recorded, so the audit log needs to say why."}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant={decision?.target === "rejected" ? "destructive" : "default"}
              disabled={reasonMissing || expiryInvalid || decide.isPending}
              onClick={() =>
                decision &&
                decide.mutate({
                  row: decision.row,
                  target: decision.target,
                  why: reason,
                })
              }
            >
              {decide.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ExceptionsPage() {
  return (
    <RequireCapability capability={CAP_SECURITY_REVIEW}>
      <ExceptionsQueue />
    </RequireCapability>
  );
}
