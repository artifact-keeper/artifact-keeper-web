"use client";

import { useQuery } from "@tanstack/react-query";

import { exceptionsApi, type PackageException } from "@/lib/api/exceptions";
import { ApiError } from "@/lib/api/fetch";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** Most recent requests shown, the backend sorts by last activity */
const SHOWN = 20;

function outcome(r: PackageException): { label: string; detail: string | null } {
  if (r.status === "approved") {
    return {
      label: "Granted",
      detail: r.expiresAt ? `until ${formatDate(r.expiresAt)}` : "with no expiry",
    };
  }
  if (r.status === "rejected") {
    return { label: "Refused", detail: r.reviewReason };
  }
  return { label: "Waiting for a reviewer", detail: null };
}

/**
 * What became of the caller's own requests. Renders nothing on a backend
 * without the endpoint, or while there is nothing to show
 */
export function MyExceptionRequests() {
  const { data, error } = useQuery({
    queryKey: ["exceptions", "mine"],
    queryFn: () => exceptionsApi.mine({ perPage: SHOWN }),
    retry: false,
  });

  if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
    return null;
  }
  if (!data || data.items.length === 0) return null;

  return (
    <section aria-labelledby="my-requests-title" className="space-y-2">
      <h2 id="my-requests-title" className="text-sm font-semibold">
        Your requests
      </h2>
      <ul className="divide-y rounded-md border text-sm">
        {data.items.map((r) => {
          const { label, detail } = outcome(r);
          return (
            <li key={r.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.packageName}
                  {r.packageVersion === "*" ? "" : `@${r.packageVersion}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.repositoryKey}
                  {r.gate ? `, ${r.gate} gate` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Badge variant={r.status === "rejected" ? "destructive" : "outline"}>
                  {label}
                </Badge>
                {detail && (
                  <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
