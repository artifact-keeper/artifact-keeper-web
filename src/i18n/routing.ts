/**
 * Supported locales and defaults for the Artifact Keeper web UI.
 *
 * The app uses the "no-prefix" i18n strategy (next-intl): the locale is
 * resolved per-request from a cookie (`NEXT_LOCALE`) instead of a URL prefix,
 * so existing route paths, deep links and Playwright specs are unaffected.
 * Add a new language by adding its code here plus the `src/i18n/locales/{locale}/`
 * message group files (see src/i18n/load-messages.ts).
 */
export const locales = ["en", "zh"] as const;

export const defaultLocale = "en" as const;

export type Locale = (typeof locales)[number];

/** Cookie name used to persist the user's chosen locale. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
