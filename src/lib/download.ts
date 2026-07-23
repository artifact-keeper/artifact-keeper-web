/**
 * Trigger a client-side file download of in-memory text content.
 *
 * Wraps the content in a Blob, creates a temporary object URL, and clicks a
 * transient `<a download>` element. The object URL is revoked on the next tick
 * so the browser has a chance to start the download before the URL is released.
 *
 * Browser-only (touches `document` / `URL`); call from event handlers, not
 * during render.
 */
export function triggerBrowserDownload(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
