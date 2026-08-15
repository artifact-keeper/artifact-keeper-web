"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

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
      defaultTheme="light"
      themes={["brand", "light", "dark"]}
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}
