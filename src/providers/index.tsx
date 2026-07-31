"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";
import { AuthProvider } from "./auth-provider";
import { InstanceProvider } from "./instance-provider";
import { SystemConfigProvider } from "./system-config-provider";

export function Providers({
  children,
  nonce,
}: {
  children: ReactNode;
  /** Per-request CSP nonce from the middleware, forwarded to next-themes. */
  nonce?: string;
}) {
  return (
    <InstanceProvider>
      <QueryProvider>
        <SystemConfigProvider>
          <ThemeProvider nonce={nonce}>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </SystemConfigProvider>
      </QueryProvider>
    </InstanceProvider>
  );
}
