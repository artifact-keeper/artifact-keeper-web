import { useEffect } from "react";

const APP_NAME = "Artifact Keeper";

/**
 * Sets `document.title` to `"<title> · Artifact Keeper"` for the lifetime of
 * the calling component and restores the previous title on unmount.
 *
 * All pages are client components, so Next.js metadata is not an option;
 * this hook is the per-page title mechanism (WCAG 2.4.2). It only touches
 * `document` inside an effect, so it is SSR-safe.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
