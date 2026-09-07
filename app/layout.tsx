import type React from "react"
import type { Metadata } from "next"
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
    <html lang="en">
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
      <body>
        <LanguageProvider>
          <AppHeader session={session} />
          {children}
          <CopyrightFooter />
        </LanguageProvider>
      </body>
    </html>
  )
}
