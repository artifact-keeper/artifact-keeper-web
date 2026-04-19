import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AuthProvider = "local" | "ldap" | "oidc" | "saml";

interface AuthSourceBadgeProps {
  provider?: string;
  className?: string;
}

const providerConfig: Record<
  AuthProvider,
  { label: string; colorClass: string }
> = {
  local: {
    label: "Local",
    colorClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  },
  ldap: {
    label: "LDAP",
    colorClass:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200 dark:border-sky-800",
  },
  oidc: {
    label: "OIDC",
    colorClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 border-violet-200 dark:border-violet-800",
  },
  saml: {
    label: "SAML",
    colorClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  },
};

function isKnownProvider(value: string): value is AuthProvider {
  return value in providerConfig;
}

/**
 * Returns the display label for an auth provider value.
 * Known providers get their canonical label; unknown values are
 * capitalized as-is.
 */
export function getAuthProviderLabel(provider?: string): string {
  if (!provider) return "Local";
  const normalized = provider.toLowerCase();
  if (isKnownProvider(normalized)) {
    return providerConfig[normalized].label;
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Renders a colored badge indicating the authentication source for a user account.
 * Supports local, LDAP, OIDC, and SAML providers with distinct colors.
 * Unknown providers are displayed with a neutral style.
 */
export function AuthSourceBadge({ provider, className }: AuthSourceBadgeProps) {
  const normalized = (provider ?? "local").toLowerCase();
  const config = isKnownProvider(normalized)
    ? providerConfig[normalized]
    : {
        label:
          provider
            ? provider.charAt(0).toUpperCase() + provider.slice(1)
            : "Local",
        colorClass:
          "bg-secondary text-secondary-foreground border-border",
      };

  return (
    <Badge
      variant="outline"
      className={cn("border font-medium", config.colorClass, className)}
      data-testid="auth-source-badge"
    >
      {config.label}
    </Badge>
  );
}
