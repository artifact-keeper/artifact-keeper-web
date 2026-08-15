import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, defaultLocale, locales } from "./routing";

/**
 * Per-request i18n configuration for next-intl.
 *
 * The locale is read from the `NEXT_LOCALE` cookie (set by the locale
 * switcher) and falls back to the browser's request via the default locale.
 * Because the root layout already reads `headers()` for the CSP nonce, every
 * route is dynamically rendered, so the cookie value is fresh on each request.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;

  const locale = (locales as readonly string[]).includes(requested ?? "")
    ? (requested as (typeof locales)[number])
    : defaultLocale;

  return {
    locale,
    messages: (await import(`./locales/${locale}.json`)).default,
  };
});
