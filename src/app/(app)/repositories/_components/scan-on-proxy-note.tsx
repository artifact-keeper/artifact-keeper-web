/**
 * The explanatory line under a repository's "Scan on proxy" toggle.
 *
 * Shared by the Security tab (`repo-detail-content.tsx`) and the Settings tab
 * (`repo-settings-tab.tsx`) — both render the same control, so the wording has
 * one home rather than two copies that drift apart.
 *
 * Backend 1.10.0 enforces the inline scan-and-block gate in four handlers only
 * (`supportsScanOnProxy` in `../_lib/constants`); every other format stores
 * `scan_on_proxy` and serves proxied content unscanned
 * (artifact-keeper#1274), which is what the unenforced wording says out loud.
 *
 * Render it only for a proxying (Remote/Virtual) repository: a hosted one
 * proxies nothing, so neither sentence applies.
 */
/**
 * Backend coverage doc for scan-on-proxy (artifact-keeper#4114): what it does,
 * the fail-open / fail-closed / record-only actions, verdict freshness, the
 * Virtual stricter-of-two rule and the per-format coverage table.
 */
export const SCAN_ON_PROXY_DOC_URL =
  "https://github.com/artifact-keeper/artifact-keeper/blob/main/docs/security/scan-on-proxy.md";

export function ScanOnProxyNote({
  id,
  enforced,
  formatLabel,
}: {
  /** Element id the toggle points at with `aria-describedby`. */
  id: string;
  /** Whether the backend actually gates this repository's format. */
  enforced: boolean;
  /** Display label for the repository's format, e.g. `MAVEN`. */
  formatLabel: string;
}) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {enforced ? (
        <>
          Inline scan outcomes for proxied downloads appear in the
          repository&rsquo;s proxy scan verdicts.
        </>
      ) : (
        <>
          Scan on proxy is enforced for npm, PyPI, Docker/OCI and VS Code
          remotes. For {formatLabel} the backend accepts the setting but serves
          proxied content unscanned (artifact-keeper#1274).
        </>
      )}{" "}
      <a
        href={SCAN_ON_PROXY_DOC_URL}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        Which formats are covered?
      </a>
    </p>
  );
}
