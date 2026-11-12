import { apiFetch } from '@/lib/api/fetch';

/**
 * The unified package-exception queue: one place to see every package a
 * withhold gate is refusing, and to grant or refuse an exception for it.
 *
 * Goes through `apiFetch` rather than the generated SDK because `/exceptions`
 * is newer than the SDK, which is the established pattern in this layer for a
 * backend surface the generator has not caught up with.
 */

/** Which gate filed the row. */
export const EXCEPTION_GATES = ['age', 'scan', 'curation'] as const;
export type ExceptionGate = (typeof EXCEPTION_GATES)[number];

/** Every state a queue row can be in. Shared with the age gate. */
export const EXCEPTION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

/**
 * `requested` means a human filed a justification; `attempted` means the row
 * exists only because a gate refused a pull. The backend derives this from
 * whether a justification is present, so the two can never disagree.
 */
export type ExceptionOrigin = 'requested' | 'attempted';

export interface PackageException {
  id: string;
  repositoryKey: string;
  packageName: string;
  packageVersion: string;
  gate: ExceptionGate | null;
  status: string;
  origin: ExceptionOrigin;
  /** Why the requester wants it. Null on an auto-filed row. */
  justification: string | null;
  /** How many times a client has been refused this coordinate. */
  requestCount: number;
  requestedAt: string;
  lastRequestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  /** The reviewer's username, sent by the backend so a non-admin can see it too. */
  reviewedByUsername: string | null;
  reviewReason: string | null;
  /** Who filed the justification. Null on an auto-filed row. */
  requestedBy: string | null;
  /**
   * The requester's username, sent by the backend so a non-admin reviewer can
   * see it too. Null on an auto-filed row, a deleted account, or a backend
   * older than the field.
   */
  requestedByUsername: string | null;
  /** When a granted exception lapses. Null means it never expires. */
  expiresAt: string | null;
  upstreamPublishedAt: string | null;
  /**
   * An administrator decided this row. Only an administrator may then grant
   * or reopen it; anyone who can review may still refuse it.
   */
  instanceLocked: boolean;
}

export interface ExceptionPage {
  items: PackageException[];
  total: number;
}

export interface ListExceptionsParams {
  /** Omit for every gate, which is the unified-queue default. */
  gates?: readonly ExceptionGate[];
  statuses?: readonly ExceptionStatus[];
  repositoryKey?: string;
  /** The reviewer's default view: only rows a human justified. */
  justifiedOnly?: boolean;
  page?: number;
  perPage?: number;
}

/** Wire shape of one row, as the backend serialises it. */
interface ExceptionWire {
  id: string;
  repository_key: string;
  package_name: string;
  package_version: string;
  gate?: string | null;
  status: string;
  origin: string;
  justification?: string | null;
  request_count: number;
  requested_at: string;
  last_requested_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_by_username?: string | null;
  review_reason?: string | null;
  requested_by?: string | null;
  requested_by_username?: string | null;
  expires_at?: string | null;
  upstream_published_at?: string | null;
  instance_locked?: boolean;
}

interface ExceptionListWire {
  items: ExceptionWire[];
  pagination: { total: number };
}

function isGate(v: string | null | undefined): v is ExceptionGate {
  return !!v && (EXCEPTION_GATES as readonly string[]).includes(v);
}

function adapt(w: ExceptionWire): PackageException {
  return {
    id: w.id,
    repositoryKey: w.repository_key,
    packageName: w.package_name,
    packageVersion: w.package_version,
    // A row from a backend older than the exception queue carries no gate.
    // Leave it null rather than inventing one, and let the UI render it as
    // unknown.
    gate: isGate(w.gate) ? w.gate : null,
    status: w.status,
    origin: w.origin === 'requested' ? 'requested' : 'attempted',
    justification: w.justification ?? null,
    requestCount: w.request_count,
    requestedAt: w.requested_at,
    lastRequestedAt: w.last_requested_at,
    requestedBy: w.requested_by ?? null,
    requestedByUsername: w.requested_by_username ?? null,
    reviewedAt: w.reviewed_at ?? null,
    reviewedBy: w.reviewed_by ?? null,
    reviewedByUsername: w.reviewed_by_username ?? null,
    reviewReason: w.review_reason ?? null,
    expiresAt: w.expires_at ?? null,
    upstreamPublishedAt: w.upstream_published_at ?? null,
    instanceLocked: w.instance_locked ?? false,
  };
}

function qs(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Default acceptance window the form pre-fills, matching the backend. */
export const DEFAULT_EXPIRY_DAYS = 90;

export interface ApproveOptions {
  reason?: string;
  /** Days until it lapses. Ignored when `neverExpires` is set. */
  expiresInDays?: number;
  /**
   * Grant permanently. Kept separate from `expiresInDays` because the backend
   * refuses both at once: "forever" has to be stated, not reached by leaving
   * a field blank.
   */
  neverExpires?: boolean;
}

export const exceptionsApi = {
  list: async (params: ListExceptionsParams = {}): Promise<ExceptionPage> => {
    const data = await apiFetch<ExceptionListWire>(
      `/api/v1/exceptions/reviews${qs({
        gate: params.gates?.length ? params.gates.join(',') : undefined,
        status: params.statuses?.length ? params.statuses.join(',') : undefined,
        repository_key: params.repositoryKey,
        justified_only: params.justifiedOnly ? 'true' : undefined,
        page: params.page?.toString(),
        per_page: params.perPage?.toString(),
      })}`,
    );
    return {
      items: (data.items ?? []).map(adapt),
      total: data.pagination?.total ?? 0,
    };
  },

  approve: async (id: string, opts: ApproveOptions = {}): Promise<PackageException> => {
    const body: Record<string, unknown> = { reason: opts.reason?.trim() || null };
    if (opts.neverExpires) {
      body.never_expires = true;
    } else if (opts.expiresInDays !== undefined) {
      body.expires_in_days = opts.expiresInDays;
    }
    const w = await apiFetch<ExceptionWire>(
      `/api/v1/exceptions/reviews/${encodeURIComponent(id)}/approve`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return adapt(w);
  },

  reject: async (id: string, reason?: string): Promise<PackageException> => {
    const w = await apiFetch<ExceptionWire>(
      `/api/v1/exceptions/reviews/${encodeURIComponent(id)}/reject`,
      { method: 'POST', body: JSON.stringify({ reason: reason?.trim() || null }) },
    );
    return adapt(w);
  },

  /** Return a decided row to `pending`, re-applying the gate. */
  reopen: async (id: string, reason: string): Promise<PackageException> => {
    const why = reason.trim();
    if (!why) throw new Error('A reason is required to reopen a decision.');
    const w = await apiFetch<ExceptionWire>(
      `/api/v1/exceptions/reviews/${encodeURIComponent(id)}/reopen`,
      { method: 'POST', body: JSON.stringify({ reason: why }) },
    );
    return adapt(w);
  },

  /**
   * Ask for a package. Any authenticated user may call this; the justification
   * is what turns a refused pull into a request the security team sees by
   * default.
   */
  request: async (input: {
    repositoryKey: string;
    gate: ExceptionGate;
    packageName: string;
    packageVersion?: string;
    justification: string;
  }): Promise<PackageException> => {
    const why = input.justification.trim();
    if (!why) throw new Error('A justification is required.');
    const w = await apiFetch<ExceptionWire>('/api/v1/exceptions/requests', {
      method: 'POST',
      body: JSON.stringify({
        repository_key: input.repositoryKey,
        gate: input.gate,
        package_name: input.packageName.trim(),
        package_version: input.packageVersion?.trim() || null,
        justification: why,
      }),
    });
    return adapt(w);
  },
};
