import type React from "react"
import type { Metadata } from "next"
import { GeistMono } from "geist/font/mono"
import { GeistSans } from "geist/font/sans"
import "./globals.css"
import { CopyrightFooter } from "@/components/copyright-footer"
import { LanguageProvider } from "@/lib/language-context"
import { AppHeader } from "@/components/app-header"
import { getSession } from "@/lib/plans"

export const metadata: Metadata = {
  title: "Alf's Mandalart Goal Planner",
  description:
    "Turn one goal into eight areas and sixty-four concrete actions, then work out what to start today.",
  verification: {
    google: "Xr81ThN5gwQvu4CGQ4f_nOahjxcv5_RUyFM1a2iqOVE",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getSession()

  return (
    // The two classes define --font-geist-sans and --font-geist-mono, which
    // globals.css has always mapped to --font-sans/--font-mono. Without them
    // that mapping pointed at nothing.
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-863WB90YC8"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-863WB90YC8');
            `,
          }}
        />
      </head>
      {/* Browser extensions write their own attributes onto <body> before
          React hydrates — a password manager, a translator, a recorder — and
          React then reports a mismatch the app cannot fix and did not cause.
          This suppresses the warning for this element's own attributes only;
          a genuine mismatch anywhere inside still reports normally. */}
      <body suppressHydrationWarning>
        <LanguageProvider>
          <AppHeader session={session} />
          {children}
          <CopyrightFooter />
        </LanguageProvider>
      </body>
    </html>
  )
}
