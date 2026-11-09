import type { ProxyScanAction } from "@/lib/api/scan-config";

export const PROXY_SCAN_ACTION_VALUES: readonly ProxyScanAction[] = [
  "fail_open",
  "fail_closed",
  "record_only",
] as const;

/** True for a mode this build knows how to present. Anything else is kept as stored. */
export function isKnownProxyScanAction(value: string): value is ProxyScanAction {
  return (PROXY_SCAN_ACTION_VALUES as readonly string[]).includes(value);
}

export const PROXY_SCAN_ACTION_LABELS: Record<ProxyScanAction, string> = {
  fail_open: "Fail open",
  fail_closed: "Fail closed",
  record_only: "Record only",
};

const HELP: Record<ProxyScanAction, string> = {
  fail_open:
    "Fail open: if the scanner is unavailable or an inline scan can't confirm the artifact is clean, the download is served anyway. Availability first — an unscanned artifact can slip through.",
  fail_closed:
    "Fail closed: if the scanner is unavailable or an inline scan can't confirm the artifact is clean, the download is blocked. Security first — a proxy outage can interrupt availability.",
  record_only:
    "Record only: downloads are always served and each scan verdict is recorded, but nothing is blocked. Use it to see what fail closed would refuse before turning it on.",
};

/** Explanation of a stored action, including one this build does not know. */
export function describeProxyScanAction(value: string): string {
  return isKnownProxyScanAction(value)
    ? HELP[value]
    : `This version of the UI does not recognise the stored mode “${value}”. It is kept as it is unless you choose another one.`;
}
