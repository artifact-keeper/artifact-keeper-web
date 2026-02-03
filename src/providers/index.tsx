"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";
import { AuthProvider } from "./auth-provider";
import { InstanceProvider } from "./instance-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <InstanceProvider>
      <QueryProvider>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </QueryProvider>
    </InstanceProvider>
  );
}
