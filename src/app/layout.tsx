import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
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
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers nonce={nonce}>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
