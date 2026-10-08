"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, AlertCircle, Loader2 } from "lucide-react";

import { environmentsApi } from "@/lib/api/environments";
import { toUserMessage } from "@/lib/error-utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * "Which environments contain this component" (#912): a package URL lookup
 * across every stored environment the viewer can read
 * (`GET /api/v1/environments/lookup`), with the inclusion chains. PURLs are
 * shown exactly as the backend returns them. Used on a repository's
 * Environments tab and on Security > Blast radius.
 */
export function EnvironmentLookup({ initialPurl = "" }: { initialPurl?: string }) {
  const [purlInput, setPurlInput] = useState(initialPurl);
  const [purl, setPurl] = useState(initialPurl);

  const {
    data: lookup,
    isFetching: lookupLoading,
    error: lookupError,
  } = useQuery({
    queryKey: ["environments-lookup", purl],
    queryFn: () => environmentsApi.lookup(purl),
    enabled: purl !== "",
    retry: false,
  });

  return (
      <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Find environments by package</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter a package URL to list every registered environment that
          contains it, across the repositories you can read, with what pulls
          it in.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPurl(purlInput.trim());
        }}
      >
        <Input
          aria-label="Package URL"
          placeholder="pkg:conda/acme-core@0.1.0"
          value={purlInput}
          onChange={(e) => setPurlInput(e.target.value)}
          className="font-mono text-xs"
        />
        <Button type="submit" disabled={purlInput.trim() === "" || lookupLoading}>
          {lookupLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Look up
        </Button>
      </form>
      {lookupError && (
        <p className="flex items-center gap-1 text-xs text-destructive" role="alert">
          <AlertCircle className="size-3.5" />
          {toUserMessage(lookupError, "Lookup failed")}
        </p>
      )}
      {lookup && !lookupLoading && (
        <div className="space-y-2" data-testid="environment-lookup-result">
          <p className="text-xs text-muted-foreground">
            {lookup.hits.length === 0
              ? `No registered environment contains ${lookup.purlBase ?? lookup.purl}.`
              : `${lookup.hits.length} match${lookup.hits.length === 1 ? "" : "es"} for ${lookup.purlBase ?? lookup.purl}`}
            {lookup.truncated && " (truncated)"}
          </p>
          {lookup.hits.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Environment</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Pulled in by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lookup.hits.map((h, i) => (
                  <TableRow key={`${h.environment.id}-${h.scope.environment}-${h.scope.platform}-${i}`}>
                    <TableCell>
                      <div className="font-medium text-sm">{h.environment.name}</div>
                      <div className="text-xs text-muted-foreground">{h.repository.key}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {h.scope.environment ?? "default"}
                      {h.scope.platform && (
                        <Badge variant="secondary" className="ml-1 font-mono text-[11px] font-normal">
                          {h.scope.platform}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {h.package.name}
                        {h.package.version && <span className="text-muted-foreground"> {h.package.version}</span>}
                      </div>
                      {h.package.purl && (
                        <code className="text-[11px] text-muted-foreground">{h.package.purl}</code>
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal">
                      {h.paths.length === 0 ? (
                        <span className="text-muted-foreground">direct</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {h.paths.slice(0, 3).map((p, j) => (
                            <li key={j} className="font-mono text-[11px]">
                              {p.join(" → ")}
                            </li>
                          ))}
                          {h.paths.length > 3 && (
                            <li className="text-muted-foreground">+{h.paths.length - 3} more</li>
                          )}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </section>
  );
}
