import type { Metadata } from "next";
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
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-[13px] font-semibold text-white">
                SE
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
          <div className="mx-auto w-full max-w-5xl px-4 py-6 text-[12px] leading-relaxed text-ink-faint">
            <p>
              Weighted using a 14-day time-decay, institution-reliability, and sample-size model over polls from
              SCB, Novus, Demoskop, Ipsos, Verian, and Indikator. Seat projections use the Sainte-Laguë method
              with a 4% threshold. Source data:{" "}
              <a
                href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-border-strong underline-offset-2 hover:text-ink-muted"
              >
                Wikipedia
              </a>
              . Not affiliated with any polling institute, party, or the Swedish Election Authority.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
