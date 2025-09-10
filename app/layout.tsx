import type React from "react"
import type { Metadata } from "next"
import { LanguageProvider } from "@/lib/language-context"
import "./globals.css"

export const metadata: Metadata = {
  title: "v0 App",
  description: "Created with v0",
  generator: "v0.dev",
  verification: {
    google: "Xr81ThN5gwQvu4CGQ4f_nOahjxcv5_RUyFM1a2iqOVE",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
