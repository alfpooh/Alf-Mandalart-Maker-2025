import type React from "react"
import type { Metadata } from "next"
import { GeistMono } from "geist/font/mono"
import { GeistSans } from "geist/font/sans"
import "./globals.css"
import { CopyrightFooter } from "@/components/copyright-footer"
import { LanguageProvider } from "@/lib/language-context"
import { AppHeader } from "@/components/app-header"
import { getSession } from "@/lib/plans"
import { resolveLanguage } from "@/lib/server-language"
import translations from "@/lib/translations.json"

/**
 * Title and description in the reader's language.
 *
 * A static `metadata` object can only be in one language, so the tab said
 * "Mandalart Goal Planner" to someone reading Korean. Resolving it per request
 * is why this is a function.
 */
export async function generateMetadata(): Promise<Metadata> {
  const language = await resolveLanguage()
  const strings = translations[language].app
  return {
    title: strings.title,
    description: strings.description,
    verification: {
      google: "Xr81ThN5gwQvu4CGQ4f_nOahjxcv5_RUyFM1a2iqOVE",
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getSession()
  // Resolved on the server so the very first byte carries the right lang, and
  // the provider starts in the right language instead of flipping out of
  // English once an effect runs.
  const language = await resolveLanguage()

  return (
    // The two classes define --font-geist-sans and --font-geist-mono, which
    // globals.css has always mapped to --font-sans/--font-mono. Without them
    // that mapping pointed at nothing.
    <html lang={language} className={`${GeistSans.variable} ${GeistMono.variable}`}>
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
        <LanguageProvider initial={language}>
          <AppHeader session={session} />
          {children}
          <CopyrightFooter />
        </LanguageProvider>
      </body>
    </html>
  )
}
