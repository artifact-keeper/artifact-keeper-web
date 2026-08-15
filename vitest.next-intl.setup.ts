// Global test setup that mocks next-intl so component tests that render
// translated text through useTranslations do not need per-file mocks.
// Translations resolve from src/i18n/for-tests.cjs (the merged English
// catalog for the test default locale),
// keeping English assertions in existing tests valid.
import { vi } from "vitest";

const i18nFixture = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const en = require("./src/i18n/for-tests.cjs") as Record<
    string,
    Record<string, string>
  >;
  return { en };
});

vi.mock("next-intl", () => ({
  // global-error.tsx seeds its own provider; in tests it just passes children
  // through (the useTranslations mock resolves the English catalog directly).
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useTranslations: (ns: string) => {
    // Resolve a possibly-dotted namespace ("admin.users") as a path into the
    // merged catalog (nested message groups). Falls back to a flat key.
    const resolvePath = (obj: unknown, path: string): unknown => {
      let cur: unknown = obj;
      for (const p of path.split(".")) {
        if (cur && typeof cur === "object" && p in (cur as object)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          return undefined;
        }
      }
      return cur;
    };

    const resolveKey = (key: string): string => {
      // Support dotted nested keys ("principalType.serviceAccount").
      const nsObj = resolvePath(i18nFixture.en, ns);
      if (!nsObj) return key;
      const parts = key.split(".");
      let cur: unknown = nsObj;
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as object)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          return key;
        }
      }
      return typeof cur === "string" ? cur : key;
    };

    const translate = (
      key: string,
      values?: Record<string, unknown>
    ): string => {
      const raw = resolveKey(key);
      let out = String(raw);
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          out = out.split(`{${k}}`).join(String(v));
        }
        // Basic ICU plural support: {count, plural, one {...} other {...}}
        out = out.replace(
          /\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/g,
          (_m, one, other) => {
            const n = Number(values["count"]);
            return n === 1
              ? one.replace("#", String(n))
              : other.replace("#", String(n));
          }
        );
      }
      return out;
    };

    const t = translate as unknown as {
      (key: string, values?: Record<string, unknown>): string;
      rich: (
        key: string,
        tags?: Record<string, (chunks: string) => string>
      ) => string;
    };
    t.rich = (
      key: string,
      values?: Record<string, unknown>
    ): string => {
      const raw = resolveKey(key);
      // Strip rich-text <tag>...</tag> markers, keeping the inner text so
      // assertions on visible copy keep matching.
      let out = String(raw).replace(/<[^>]+>([^<]*)<\/[^>]+>/g, "$1");
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          out = out.split(`{${k}}`).join(String(v));
        }
      }
      return out;
    };
    return t;
  },
}));

// next-intl/server is used by server components and layouts (e.g. the root
// layout's generateMetadata + getLocale). Without a mock, tests that render
// them hit next-intl's "getLocale is not supported in Client Components"
// guard in the jsdom environment. getLocale returns the test default locale
// ("en"); getTranslations resolves the same English catalog as useTranslations.
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (ns: string) => {
    const resolvePath = (obj: unknown, path: string): unknown => {
      let cur: unknown = obj;
      for (const p of path.split(".")) {
        if (cur && typeof cur === "object" && p in (cur as object)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          return undefined;
        }
      }
      return cur;
    };
    const nsObj = resolvePath(i18nFixture.en, ns) as
      | Record<string, unknown>
      | undefined;
    const t = (key: string): string => {
      const parts = key.split(".");
      let cur: unknown = nsObj;
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as object)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          return key;
        }
      }
      return typeof cur === "string" ? cur : key;
    };
    return t;
  },
}));
