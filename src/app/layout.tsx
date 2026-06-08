import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Providers } from "@/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ak — Artifact Keeper",
  description:
    "An artifact registry built for the terminal generation. Type-driven, dense, signed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jetbrainsMono.variable} antialiased`}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
