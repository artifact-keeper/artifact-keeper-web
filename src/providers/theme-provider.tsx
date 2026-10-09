"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Selectable themes, in menu order. Each value is also the class next-themes
 * puts on `<html>`; `globals.css` defines the tokens for each one (`light`
 * uses the `:root` defaults). `system` follows the OS between `light` and
 * `dark`.
 */
export const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "light-neutral", label: "Light (neutral)" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

const THEMES = THEME_OPTIONS.map((option) => option.value).filter(
  (value) => value !== "system",
);

export function ThemeProvider({
  children,
  nonce,
}: {
  children: ReactNode;
  /**
   * Per-request CSP nonce. next-themes injects an inline theme-bootstrap
   * script (to avoid a flash of the wrong theme); without this nonce the
   * script is blocked by `script-src 'nonce-…'`.
   */
  nonce?: string;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      themes={THEMES}
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}
