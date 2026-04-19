import { ShieldAlert } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { formatQuarantineExpiry } from "@/lib/quarantine";

interface QuarantineBannerProps {
  reason?: string | null;
  quarantineUntil?: string | null;
}

/**
 * Prominent warning banner displayed at the top of artifact detail views
 * when the artifact is currently under quarantine. Shows the reason and
 * expiry time when available.
 */
export function QuarantineBanner({
  reason,
  quarantineUntil,
}: QuarantineBannerProps) {
  const expiry = formatQuarantineExpiry(quarantineUntil);

  return (
    <Alert
      className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <AlertTitle className="font-semibold">
        This artifact is quarantined
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-1">
          {reason && <p>{reason}</p>}
          {expiry && (
            <p className="text-amber-700 dark:text-amber-400 text-xs">
              {expiry}
            </p>
          )}
          {!reason && !expiry && (
            <p>
              Downloads may be restricted until the quarantine is lifted by an administrator.
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
