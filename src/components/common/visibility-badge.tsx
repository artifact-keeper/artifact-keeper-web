import { Globe, Lock, Users, type LucideIcon } from "lucide-react";
import type { RepositoryVisibility } from "@/types";
import { visibilityLabel } from "@/lib/repo-visibility";
import { Badge } from "@/components/ui/badge";

/** Icon for each visibility state; `internal` never shares the private padlock. */
export const VISIBILITY_ICONS: Record<RepositoryVisibility, LucideIcon> = {
  public: Globe,
  internal: Users,
  private: Lock,
};

/**
 * Badge naming a repository's visibility (Public / Internal / Private), shared
 * by the repository detail header and the blast-radius report so an `internal`
 * repository is never labelled "Private" on either.
 */
export function VisibilityBadge({
  visibility,
  showIcon = false,
  variant,
  className,
}: {
  visibility: RepositoryVisibility;
  showIcon?: boolean;
  variant?: "outline" | "secondary";
  className?: string;
}) {
  const Icon = VISIBILITY_ICONS[visibility];
  return (
    <Badge
      variant={variant ?? (visibility === "public" ? "outline" : "secondary")}
      className={className}
    >
      {showIcon ? <Icon className="mr-1 size-3" aria-hidden="true" /> : null}
      {visibilityLabel(visibility)}
    </Badge>
  );
}
