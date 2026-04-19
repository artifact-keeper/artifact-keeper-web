import { ExternalLink } from "lucide-react";
import { advisoryUrl, vulnIdType } from "@/lib/vuln-utils";

interface VulnIdLinkProps {
  /** The vulnerability identifier (CVE-xxxx, GHSA-xxxx, or other). */
  id: string;
  /** Optional source label displayed after the identifier (e.g. "NVD", "GHSA"). */
  source?: string | null;
  /** Additional CSS classes applied to the outer element. */
  className?: string;
  /** Whether to show an external link icon next to linked identifiers. */
  showIcon?: boolean;
}

/**
 * Renders a vulnerability identifier as a link when possible.
 *
 * CVE identifiers link to NVD. GHSA identifiers link to GitHub Advisories.
 * Unknown identifier formats render as plain text.
 */
export function VulnIdLink({
  id,
  source,
  className,
  showIcon = false,
}: VulnIdLinkProps) {
  const url = advisoryUrl(id);
  const type = vulnIdType(id);

  const sourceLabel = source ?? (type !== "Advisory" ? type : null);

  if (url) {
    return (
      <div className={className}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1 font-mono font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          {id}
          {showIcon && <ExternalLink className="size-3" />}
        </a>
        {sourceLabel && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            {sourceLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <span className="font-medium text-sm font-mono">{id}</span>
      {sourceLabel && (
        <span className="ml-1.5 text-xs text-muted-foreground">
          {sourceLabel}
        </span>
      )}
    </div>
  );
}
