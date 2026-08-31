import type { Metadata } from "next";
import Image from "next/image";
import Script from "next/script";
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

const SITE_URL = "https://frontend-one-delta-qiasdszc81.vercel.app";
const SITE_TITLE = "2026 Swedish Election — Poll of Polls";
const SITE_DESCRIPTION =
  "A weighted poll-of-polls dashboard for the 2026 Swedish general election";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Poll of Polls",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Sweden Votes — 2026 General Election Poll of Polls",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
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
                href="https://www.linkedin.com/company/cwsofficial"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Christoffer W Studio"
                className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white shadow-sm"
              >
                <Image src="/cws-logo.png" alt="" width={24} height={24} className="h-full w-full object-cover" />
              </a>
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
              This website is provided for informational purposes only and does not constitute a
              forecast, endorsement, or official result. All raw polling data is sourced from third
              parties —{" "}
              <a
                href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Swedish_general_election"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-border-strong underline-offset-2 hover:text-ink-muted"
              >
                Wikipedia
              </a>{" "}
              — and has not been independently verified by us. See the Methodology section above for the
              full weighting model. Not affiliated with any polling institute, party, or the Swedish
              Election Authority.{" "}
              <a
                href="https://github.com/wenyuiwu-lgtm/sweden-election-2026"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-border-strong underline-offset-2 hover:text-ink-muted"
              >
                Source
              </a>
              .
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
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-G93G1W29DN"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-G93G1W29DN');
          `}
        </Script>
      </body>
    </html>
  );
}
