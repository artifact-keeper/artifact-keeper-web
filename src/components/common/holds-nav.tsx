"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Hourglass, ShieldAlert, Ban } from "lucide-react";
import { holdsApi, HOLD_SUMMARY_QUERY_KEY, type HoldsSummary } from "@/lib/api/holds";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/age-gate",
    label: "Age Gate",
    icon: Hourglass,
    count: (s: HoldsSummary) => s.ageGatePending,
    hint: "pending",
  },
  {
    href: "/quarantine",
    label: "Quarantine",
    icon: ShieldAlert,
    count: (s: HoldsSummary) => s.quarantineActive + s.quarantineRejected,
    hint: "held",
  },
  {
    href: "/policy-blocks",
    label: "Policy blocks",
    icon: Ban,
    count: (s: HoldsSummary) => s.policyBlocked,
    hint: "blocked",
  },
] as const;

export function HoldsNav() {
  const pathname = usePathname();
  const { data: summary } = useQuery({
    queryKey: HOLD_SUMMARY_QUERY_KEY,
    queryFn: holdsApi.summary,
    staleTime: 30_000,
  });

  return (
    <nav
      aria-label="Download holds"
      className="flex flex-wrap gap-1 rounded-md border bg-muted/40 p-1"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const count =
          summary && typeof tab.count(summary) === "number" ? tab.count(summary) : null;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
            {count !== null && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  active ? "bg-muted" : "bg-background",
                )}
                title={`${count} ${tab.hint}`}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
