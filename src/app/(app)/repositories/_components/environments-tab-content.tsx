"use client";

import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";

import { environmentsApi } from "@/lib/api/environments";
import { EnvironmentLockfileTools } from "./environment-lockfile-tools";
import { EnvironmentLookup } from "@/components/common/environment-lookup";
import { ApiError } from "@/lib/api/fetch";
import { toUserMessage } from "@/lib/error-utils";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function unavailable(error: unknown): boolean {
  // An older backend has no environments routes: the repository-scoped one
  // falls through to 404/405.
  return error instanceof ApiError && (error.status === 404 || error.status === 405);
}

/**
 * Environments registered against this repository (lockfiles ingested with
 * `POST /api/v1/repositories/{key}/environments`, backend 1.11.0) and a PURL
 * lookup across every environment the viewer can read: "which of our
 * environments contain this package, and what pulls it in?".
 */
export function EnvironmentsTabContent({
  repoKey,
  canRegister = false,
}: {
  repoKey: string;
  /** Whether to offer registering a lockfile (repository write). */
  canRegister?: boolean;
}) {

  const {
    data: environments,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["environments", repoKey],
    queryFn: () => environmentsApi.list(repoKey),
    retry: false,
  });


  if (error && unavailable(error)) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Stored environments need backend 1.11.0 or later.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EnvironmentLookup />

      <EnvironmentLockfileTools repoKey={repoKey} canRegister={canRegister} />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Registered environments</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lockfiles stored against {repoKey}.
          </p>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <p className="text-xs text-destructive" role="alert">
            {toUserMessage(error, "Could not load environments")}
          </p>
        ) : (environments?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center rounded-md border border-dashed py-8 text-center text-muted-foreground">
            <Boxes className="size-6 mb-2 opacity-50" />
            <p className="text-sm">No environments registered for this repository.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Lockfile</TableHead>
                <TableHead className="text-right">Packages</TableHead>
                <TableHead className="text-right">Scopes</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {environments!.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    {e.lockfileFormat ? (
                      <Badge variant="outline" className="font-normal">{e.lockfileFormat}</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right">{e.distinctPackages ?? "-"}</TableCell>
                  <TableCell className="text-right">{e.scopes ?? "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.updatedAt ? new Date(e.updatedAt).toLocaleString() : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
