import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, defaultLocale, locales } from "./routing";
import { loadMessages } from "./load-messages";

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
    // Only the always-on "core" namespaces are provided globally. Feature
    // routes load their own groups via a nested NextIntlClientProvider (see
    // src/i18n/load-messages.ts), so the per-page client payload stays small
    // instead of shipping the full catalog on every request.
    messages: await loadMessages(locale, ["core"]),
  };
});
