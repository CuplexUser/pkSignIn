import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Providers } from "@/components/providers";
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
  title: "Passkey Demo",
  description: "WebAuthn passkey authentication with a hardware security key.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // next-themes sets the class on <html> before paint, which React would otherwise
      // report as a hydration mismatch.
      suppressHydrationWarning
    >
      <body className="bg-muted/30 flex min-h-full flex-col">
        <Providers>
          <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
            <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <KeyRound className="size-4" />
                Passkey Demo
              </Link>
              <span className="text-muted-foreground ml-auto text-xs">WebAuthn / FIDO2</span>
            </div>
          </header>

          {/* pb-20 keeps the debug toggle from covering the end of the page. */}
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-20">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
