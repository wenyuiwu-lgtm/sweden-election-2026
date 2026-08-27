import type { Metadata } from "next";
import Image from "next/image";
import { Inter, Source_Serif_4 } from "next/font/google";
import { ThemeInit } from "@/components/ThemeInit";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "2026 Swedish Election — Poll of Polls",
  description: "A weighted poll-of-polls dashboard for the 2026 Swedish general election",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-bg text-ink" suppressHydrationWarning>
        <ThemeInit />
        <header className="border-b border-border">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="h-7 w-11 shrink-0 overflow-hidden rounded-sm shadow-sm" aria-hidden="true">
                <svg viewBox="0 0 16 10" className="h-full w-full" preserveAspectRatio="none">
                  <rect width="16" height="10" fill="#006AA7" />
                  <rect x="5" width="2" height="10" fill="#FECC00" />
                  <rect y="4" width="16" height="2" fill="#FECC00" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="font-serif-display text-[15px] font-semibold">Poll of Polls</div>
                <div className="text-[11px] uppercase tracking-wide text-ink-faint">2026 Swedish General Election</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/wenyuiwu-lgtm/sweden-election-2026"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:block text-[13px] text-ink-muted hover:text-ink"
              >
                Source
              </a>
              <ThemeToggle />
            </div>
          </div>
        </header>
        {children}
        <footer className="border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-[12px] leading-relaxed text-ink-faint">
            <p>
              Source data:{" "}
              <a
                href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-border-strong underline-offset-2 hover:text-ink-muted"
              >
                Wikipedia
              </a>
              . See the Methodology section above for the full weighting model. Not affiliated with any
              polling institute, party, or the Swedish Election Authority.
            </p>
            <a
              href="https://www.linkedin.com/company/cwsofficial"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 shrink-0 text-[13px] font-medium text-ink-muted hover:text-ink"
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm">
                <Image src="/cws-logo.png" alt="" width={36} height={36} className="h-full w-full object-cover" />
              </span>
              Created by Christoffer W Studio
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
