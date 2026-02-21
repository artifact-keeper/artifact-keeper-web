# Live Data Refresh - Design Document

## Problem

Pages don't auto-update when data changes. Users must manually refresh the browser to see new data after navigating between pages, switching tabs, or when changes are made by other users/sessions.

### Root Causes

1. **Conservative cache defaults** - `staleTime: 5 minutes` means data is served from cache for 5 full minutes before TanStack Query considers it stale. `refetchOnWindowFocus: false` means switching browser tabs never triggers a refetch.

2. **Cross-page invalidation gaps** - Mutations correctly invalidate same-page queries but miss related queries on other pages. Five different repository query keys exist across the app, and only the local one gets invalidated. Dashboard stats are never invalidated by admin mutations.

3. **No real-time layer** - No WebSocket or SSE push mechanism for multi-user/multi-session updates.

### Identified Gaps

| Gap | Severity | Pages Affected |
|-----|----------|----------------|
| Repository mutations don't invalidate all repo query variants | High | Search, Replication, Security Scans, Dashboard |
| User/Group/Service Account mutations don't invalidate admin-stats | High | Dashboard |
| Group member changes don't sync to permissions queries | Medium | Permissions |
| Quality gate dashboard not invalidated by repo changes | Medium | Quality Gates |

## Solution: Two-Phase Approach

### Phase 1: Smart Cache Tuning + Cross-Page Invalidation (Frontend-only)

#### 1.1 Global Query Defaults

**File:** `src/providers/query-provider.tsx`

Change the QueryClient default options:

```typescript
staleTime: 30_000,           // 30 seconds (was 5 minutes)
retry: 1,
refetchOnWindowFocus: true,  // refetch on tab switch (was false)
refetchOnReconnect: true,    // refetch on network reconnect (was unset)
```

Pages that already override staleTime locally (DT status: 60s, search: 30s, monitoring/backups with refetchInterval) are unaffected.

#### 1.2 Global Mutation Handler via MutationCache

Add a `MutationCache` with a global `onSuccess` that invalidates dashboard-level queries on any mutation:

```typescript
const mutationCache = new MutationCache({
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["recent-repositories"] });
  },
});
```

Dashboard stats are aggregate counts (users, repos, groups, etc.) that any admin action could change. The cost of one extra background GET is negligible compared to showing stale numbers.

#### 1.3 Cross-Page Repository Invalidation

In `src/app/(app)/repositories/page.tsx`, broaden mutation `onSuccess` to invalidate all repository-related query keys:

```typescript
queryClient.invalidateQueries({ queryKey: ["repositories"] });
queryClient.invalidateQueries({ queryKey: ["repositories-list"] });
queryClient.invalidateQueries({ queryKey: ["repositories-for-scan"] });
queryClient.invalidateQueries({ queryKey: ["repositories-all"] });
queryClient.invalidateQueries({ queryKey: ["recent-repositories"] });
```

#### 1.4 Admin Entity Cross-Invalidation

- **Users page mutations** also invalidate `["admin-groups"]` (users belong to groups)
- **Groups page mutations** also invalidate `["admin-permissions"]` (permissions reference groups)
- **Repository mutations** also invalidate `["quality-health-dashboard"]`

### Phase 2: SSE Event Stream (Backend + Frontend, future work)

#### 2.1 Backend SSE Endpoint

Add `/api/v1/events/stream` SSE endpoint that publishes domain events:

```
event: entity.changed
data: {"type":"user.created","entity_id":"uuid","timestamp":"..."}

event: entity.changed
data: {"type":"repository.deleted","entity_id":"repo-key","timestamp":"..."}
```

The SDK already has `createSseClient` with retry logic and exponential backoff. The migration page already uses native `EventSource` for streaming. This extends the pattern to general domain events.

#### 2.2 Frontend useEventStream Hook

Create a `useEventStream()` hook that:
- Connects to the SSE endpoint when authenticated
- Maps event types to query key invalidation
- Reconnects automatically on disconnect (using SDK's SSE client or native EventSource with retry)
- Disconnects on logout

#### 2.3 Integration

Mount `useEventStream()` in the authenticated layout. This replaces the need for aggressive `staleTime` since the server pushes invalidation signals when data actually changes. The `staleTime` could then be raised back to minutes.

#### 2.4 Event Type to Query Key Mapping

```typescript
const EVENT_INVALIDATION_MAP: Record<string, string[][]> = {
  "user.created":     [["admin-users"], ["admin-stats"]],
  "user.updated":     [["admin-users"], ["admin-stats"]],
  "user.deleted":     [["admin-users"], ["admin-stats"]],
  "repository.created": [["repositories"], ["repositories-list"], ["recent-repositories"], ["admin-stats"]],
  "repository.deleted": [["repositories"], ["repositories-list"], ["recent-repositories"], ["admin-stats"]],
  "service-account.created": [["service-accounts"], ["admin-stats"]],
  // ... etc
};
```

## Scope

Phase 1 is frontend-only and touches these files:
- `src/providers/query-provider.tsx` (global defaults + MutationCache)
- `src/app/(app)/repositories/page.tsx` (repo mutation cross-invalidation)
- `src/app/(app)/(admin)/users/page.tsx` (user mutation cross-invalidation)
- `src/app/(app)/(admin)/groups/page.tsx` (group mutation cross-invalidation)

Phase 2 requires backend work (Rust SSE endpoint) and is a separate effort.

## What This Does NOT Change

- Individual page staleTime overrides (DT, search, monitoring) stay as-is
- Mutation `onSuccess` callbacks still do their local invalidation (we add to them, not replace)
- No optimistic updates (data shows after server confirms, not before)
- No WebSocket (SSE is simpler, already proven in the codebase)
