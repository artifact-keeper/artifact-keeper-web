import { AlertTriangle, CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import { CopyButton } from "@/components/common/copy-button";

interface TokenCreatedAlertProps {
  title: string;
  description: string;
  token: string;
  /**
   * The expiry the server actually stamped on the mint (`expires_at`), or
   * null/undefined when the token never expires. Backend artifact-keeper#3460
   * made this authoritative, so it is reported here rather than echoing back
   * whatever the form asked for (web #854).
   */
  expiresAt?: string | null;
  /**
   * True when the instance token expiration policy set or clamped that
   * expiry, so the reveal can say why the date is not the one requested.
   */
  policyApplied?: boolean;
  onDone: () => void;
}

/** Format an ISO-8601 instant, or null when it isn't one. */
function formatExpiry(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString();
}

export function TokenCreatedAlert({
  title,
  description,
  token,
  expiresAt,
  policyApplied,
  onDone,
}: TokenCreatedAlertProps) {
  const expiryLabel = expiresAt ? formatExpiry(expiresAt) : null;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Alert
        variant="destructive"
        className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800"
      >
        <AlertTriangle className="size-4" />
        <AlertTitle>Store it safely</AlertTitle>
        <AlertDescription>
          This will only be shown once. Store it in a secure location.
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
        <code className="flex-1 break-all text-sm">{token}</code>
        <CopyButton value={token} />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5 shrink-0" />
        <span>
          {expiryLabel ? (
            <>
              Expires <span title={expiresAt ?? undefined}>{expiryLabel}</span>
              {policyApplied ? " \u00b7 set by instance policy" : null}
            </>
          ) : (
            "Never expires"
          )}
        </span>
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  );
}
