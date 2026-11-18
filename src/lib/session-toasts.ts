import { toast } from "sonner";

/**
 * Toasts that belong to the signed-in session and must not outlive it, such
 * as a failed repository deletion's toast with its Retry button (#1228). The
 * auth provider dismisses them all on sign-out.
 */
const ids = new Set<string>();

export function trackSessionToast(id: string): void {
  ids.add(id);
}

export function untrackSessionToast(id: string): void {
  ids.delete(id);
}

export function dismissSessionToasts(): void {
  for (const id of ids) toast.dismiss(id);
  ids.clear();
}
