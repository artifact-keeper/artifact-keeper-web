import { toUserMessage } from "@/lib/error-utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface LifecycleCapabilityNoticeProps {
  pending: boolean;
  error: unknown;
  onRetry: () => void;
}

export function LifecycleCapabilityNotice({
  pending, error, onRetry,
}: LifecycleCapabilityNoticeProps) {
  if (pending) {
    return <p role="status" className="text-sm text-muted-foreground">Checking cleanup policy assignment support...</p>;
  }
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Cleanup policy assignment unavailable</AlertTitle>
      <AlertDescription>
        <p>{toUserMessage(error, "Unable to verify backend assignment support.")}</p>
        <p>Creation and assignment changes are blocked until support is confirmed. Existing policies can still be viewed.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry support check</Button>
      </AlertDescription>
    </Alert>
  );
}
