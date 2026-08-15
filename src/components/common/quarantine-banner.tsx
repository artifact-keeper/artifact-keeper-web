import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { formatQuarantineExpiry } from "@/lib/quarantine";

interface QuarantineBannerProps {
  /**
   * Why the artifact is held. Absent whenever the caller cannot access the
   * repository — the backend redacts it because it carries internal policy
   * names, finding counts and admin incident notes. The banner still states
   * the hold in that case; only the specifics are missing.
   */
  reason?: string | null;
  quarantineUntil?: string | null;
  /**
   * Raw `quarantine_status`. A rejected artifact is blocked permanently, not
   * held pending a decision, so it gets its own wording rather than promising
   * a release that will never come.
   */
  status?: string | null;
}

/**
 * Prominent warning banner displayed at the top of artifact detail views
 * when the artifact's downloads are currently blocked. Shows the reason and
 * expiry time when available.
 */
export function QuarantineBanner({
  reason,
  quarantineUntil,
  status,
}: QuarantineBannerProps) {
  const t = useTranslations("common");
  const expiry = formatQuarantineExpiry(quarantineUntil);
  const rejected = status === "rejected";

  return (
    <Alert
      className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <AlertTitle className="font-semibold">
        {rejected
          ? t("quarantineBannerRejectedTitle")
          : t("quarantineBannerTitle")}
      </AlertTitle>
      <AlertDescription>
        <div className="space-y-1">
          {/* Always stated, so a banner whose reason was redacted still says
              what is happening instead of trailing off into an empty box. */}
          <p>
            {rejected
              ? t("quarantineBannerRejectedDescription")
              : t("quarantineBannerDescription")}
          </p>
          {reason && <p>{reason}</p>}
          {expiry && (
            <p className="text-amber-700 dark:text-amber-400 text-xs">
              {expiry}
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

