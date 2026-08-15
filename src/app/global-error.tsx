"use client";

import { useEffect } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import enMessages from "@/i18n/locales/en/global-error.json";
import zhMessages from "@/i18n/locales/zh/global-error.json";

type ErrorInfo = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

// global-error.tsx replaces the entire root layout, so it renders OUTSIDE the
// app's NextIntlClientProvider tree and cannot use the per-route messages. It
// also has to render when the app itself is broken, so it must not fetch or
// depend on runtime state. It therefore seeds its own tiny provider with just
// the `global-error` namespace, read statically from the locale catalogs; the
// body then uses useTranslations like every other component.
const messages: Record<string, Record<string, unknown>> = {
  en: { "global-error": enMessages },
  zh: { "global-error": zhMessages },
};

function getLocale(): "en" | "zh" {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  return match && match[1] === "zh" ? "zh" : "en";
}

export default function GlobalError({ error, reset }: ErrorInfo) {
  const locale = getLocale();
  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#0a0a12",
          color: "#e8e0d4",
          padding: "1.5rem",
        }}
      >
        <NextIntlClientProvider locale={locale} messages={messages[locale]}>
          <GlobalErrorContent error={error} reset={reset} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function GlobalErrorContent({ error, reset }: ErrorInfo) {
  const t = useTranslations("global-error");

  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        maxWidth: "28rem",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-48.png"
        alt="Artifact Keeper"
        width={48}
        height={48}
        style={{ marginBottom: "1.5rem" }}
      />
      <h1
        style={{
          fontSize: "1.25rem",
          fontWeight: 600,
          letterSpacing: "-0.025em",
          margin: 0,
        }}
      >
        {t("somethingWentWrong")}
      </h1>
      <p
        style={{
          marginTop: "0.5rem",
          fontSize: "0.875rem",
          lineHeight: 1.6,
          color: "#9a918a",
        }}
      >
        {t("globalDescription")}
      </p>
      {error.digest && (
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "0.75rem",
            color: "#9a918a",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {t("errorId", { digest: error.digest })}
        </p>
      )}
      <div
        style={{
          marginTop: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <button
          onClick={reset}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "0.375rem",
            backgroundColor: "#d4a853",
            color: "#0a0a12",
            padding: "0.625rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          {t("tryAgain")}
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "0.375rem",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            backgroundColor: "transparent",
            color: "#e8e0d4",
            padding: "0.625rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          {t("goToHome")}
        </a>
      </div>
    </div>
  );
}
