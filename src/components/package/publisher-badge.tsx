import { BadgeCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PublisherInfo } from "@/lib/attestation";

/**
 * Publisher of a package with its trust tier (#921). A verified publisher is
 * backed by a registry-verified attestation; a declared maintainer is only
 * what the package says about itself, and is labelled so it can never be read
 * as a check.
 */
export function PublisherBadge({ publisher }: { publisher: PublisherInfo }) {
  if (publisher.tier === "verified") {
    return (
      <Badge
        variant="outline"
        className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900"
        title="Bound to a publish attestation the registry verified"
        data-testid="publisher-badge"
      >
        <BadgeCheck className="size-3.5" />
        Verified publisher: {publisher.name}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 font-normal text-muted-foreground"
      title="Declared in the package's own metadata (about.json); not verified"
      data-testid="publisher-badge"
    >
      <UserRound className="size-3.5" />
      Declared maintainer: {publisher.name} (not verified)
    </Badge>
  );
}
