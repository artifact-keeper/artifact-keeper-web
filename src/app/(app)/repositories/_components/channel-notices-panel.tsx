"use client";

import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";

import { condaApi } from "@/lib/api/conda";
import { toUserMessage } from "@/lib/error-utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A conda channel's CEP-6 notices (`/conda/{key}/notices.json`), newest
 * first (#913). Withdrawals append here; clients show them on install.
 */
export function ChannelNoticesPanel({ repoKey }: { repoKey: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["conda-notices", repoKey],
    queryFn: () => condaApi.getNotices(repoKey),
    retry: false,
  });
  const notices = [...(data ?? [])].reverse();

  return (
    <div className="space-y-3" data-testid="channel-notices">
      <div>
        <h3 className="text-sm font-medium">Channel notices</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          CEP-6 notices served at <code>/conda/{repoKey}/notices.json</code>. conda
          and pixi show them to users of this channel.
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : error ? (
        <p className="text-xs text-destructive" role="alert">
          {toUserMessage(error, "Could not load channel notices")}
        </p>
      ) : notices.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed py-8 text-center text-muted-foreground">
          <Megaphone className="size-6 mb-2 opacity-50" />
          <p className="text-sm">No notices on this channel.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {notices.map((n) => (
            <li key={n.id} className="space-y-1 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {n.level && (
                  <Badge variant={n.level === "warning" ? "destructive" : "outline"} className="text-[11px]">
                    {n.level}
                  </Badge>
                )}
                {n.created_at && <span>{new Date(n.created_at).toLocaleString()}</span>}
                {n.subdir && <code>{n.subdir}</code>}
              </div>
              <p className="text-sm">{n.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
