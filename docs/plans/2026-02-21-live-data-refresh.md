# Live Data Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the UI feel live by reducing stale data, adding cross-page cache invalidation, and preparing for future SSE-based real-time updates.

**Architecture:** Phase 1 (this plan) is frontend-only. Tune TanStack Query global defaults (30s stale, refetch on focus/reconnect), add a global MutationCache handler to invalidate dashboard stats on any mutation, and broaden per-page mutation invalidation to cover cross-page query keys.

**Tech Stack:** TanStack Query 5, Next.js 15, Vitest

---

### Task 1: Update Global Query Defaults

**Files:**
- Modify: `src/providers/query-provider.tsx:1-23`

**Step 1: Update the QueryClient configuration**

Replace the entire file content:

```typescript
"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: () => {
          // Dashboard stats are aggregate counts affected by any data mutation.
          // The cost of one extra background GET is negligible vs stale numbers.
          client.invalidateQueries({ queryKey: ["admin-stats"] });
          client.invalidateQueries({ queryKey: ["recent-repositories"] });
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: 1,
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
        },
      },
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

Changes from previous version:
- `staleTime`: `5 * 60 * 1000` (5 min) changed to `30_000` (30s)
- `refetchOnWindowFocus`: `false` changed to `true`
- `refetchOnReconnect: true` added
- `MutationCache` with global `onSuccess` added (invalidates dashboard stats on any mutation)
- `queryClient` variable extracted so `MutationCache.onSuccess` can reference it

**Step 2: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds. No type errors.

**Step 3: Verify unit tests pass**

Run: `npm run test`
Expected: All existing tests pass (this change doesn't affect test utilities).

**Step 4: Commit**

```bash
git add src/providers/query-provider.tsx
git commit -m "feat: tune query defaults for live data (30s stale, refetch on focus)"
```

---

### Task 2: Cross-Page Repository Invalidation

Five different repository query keys exist across the app. Repository mutations on `/repositories` only invalidate `["repositories"]`, leaving the others stale.

**Files:**
- Modify: `src/app/(app)/repositories/page.tsx:98-143`

**Step 1: Create a helper to invalidate all repository query keys**

At the top of the mutations section (around line 97, after the queries block), add a helper function:

```typescript
  /** Invalidate all repository-related queries across the app. */
  const invalidateAllRepoQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["repositories"] });
    queryClient.invalidateQueries({ queryKey: ["repositories-list"] });
    queryClient.invalidateQueries({ queryKey: ["repositories-for-scan"] });
    queryClient.invalidateQueries({ queryKey: ["repositories-all"] });
    queryClient.invalidateQueries({ queryKey: ["recent-repositories"] });
    queryClient.invalidateQueries({ queryKey: ["quality-health-dashboard"] });
  };
```

**Step 2: Update createMutation (line 100-101)**

Replace:
```typescript
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
```

With:
```typescript
    onSuccess: () => {
      invalidateAllRepoQueries();
```

**Step 3: Update updateMutation (line 113-114)**

Replace:
```typescript
    onSuccess: (updatedRepo, { key: originalKey }) => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
```

With:
```typescript
    onSuccess: (updatedRepo, { key: originalKey }) => {
      invalidateAllRepoQueries();
```

**Step 4: Update deleteMutation (line 133-134)**

Replace:
```typescript
    onSuccess: (_, deletedKey) => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
```

With:
```typescript
    onSuccess: (_, deletedKey) => {
      invalidateAllRepoQueries();
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/app/\(app\)/repositories/page.tsx
git commit -m "feat: broaden repo mutation invalidation to all repo query keys"
```

---

### Task 3: Users Page Cross-Invalidation

User mutations should also invalidate `["admin-groups"]` since users belong to groups and group member lists show user info.

**Files:**
- Modify: `src/app/(app)/(admin)/users/page.tsx:125-237`

**Step 1: Add group invalidation to createMutation (line 143-144)**

After the existing `invalidateQueries` call on line 144, add:
```typescript
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
```

**Step 2: Add group invalidation to updateMutation (line 175-177)**

After the existing `invalidateQueries` call on line 177, add:
```typescript
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
```

**Step 3: Add group invalidation to toggleStatusMutation (line 194-196)**

After the existing `invalidateQueries` call on line 196, add:
```typescript
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
```

**Step 4: Add group invalidation to deleteMutation (line 228-230)**

After the existing `invalidateQueries` call on line 230, add:
```typescript
      queryClient.invalidateQueries({ queryKey: ["admin-groups"] });
```

Skip `resetPasswordMutation` (password changes don't affect displayed data in group views).

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/app/\(app\)/\(admin\)/users/page.tsx
git commit -m "feat: user mutations also invalidate admin-groups queries"
```

---

### Task 4: Groups Page Cross-Invalidation

Group membership mutations should also invalidate `["admin-permissions"]` since permissions reference groups.

**Files:**
- Modify: `src/app/(app)/(admin)/groups/page.tsx:104-165`

**Step 1: Add permissions invalidation to addMemberMutation (line 143-148)**

After the existing two `invalidateQueries` calls (lines 145-148), add:
```typescript
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
```

**Step 2: Add permissions invalidation to removeMemberMutation (line 157-162)**

After the existing two `invalidateQueries` calls (lines 159-162), add:
```typescript
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
```

**Step 3: Add permissions invalidation to deleteMutation (line 131-133)**

After the existing `invalidateQueries` call on line 133, add:
```typescript
      queryClient.invalidateQueries({ queryKey: ["admin-permissions"] });
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/app/\(app\)/\(admin\)/groups/page.tsx
git commit -m "feat: group mutations also invalidate admin-permissions queries"
```

---

### Task 5: Verify Full CI Pipeline

**Step 1: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

**Step 2: Run unit tests**

Run: `npm run test`
Expected: All tests pass.

**Step 3: Run build**

Run: `npm run build`
Expected: Clean build with no errors.

**Step 4: Push and verify CI**

```bash
git push
```

Check that all CI jobs pass (lint, unit tests, build, E2E interactions, RBAC roles, visual regression).
