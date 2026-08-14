import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/providers";
import { Toaster } from "@/components/ui/sonner";
import { NONCE_HEADER } from "@/lib/security-headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Artifact Keeper",
  description:
    "Enterprise artifact registry for managing software packages across multiple formats.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request CSP nonce set by the middleware. Reading `headers()` also
  // opts every route into dynamic rendering, which nonce-based CSP requires:
  // Next.js stamps the nonce onto framework scripts during SSR only.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  // Resolve the active locale + messages (from the NEXT_LOCALE cookie) and
  // expose them to client components via NextIntlClientProvider.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <Providers nonce={nonce}>{children}</Providers>
        </NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
