import type React from "react"
import type { Metadata } from "next"
import Script from "next/script"
import { LanguageProvider } from "@/lib/language-context"
import "./globals.css"

export const metadata: Metadata = {
  title: "Mandalart Goal Planner",
  description: "AI-powered goal planning with Mandalart visualization",
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
      <head></head>
      <body>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-863WB90YC8" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            console.log('[v0] Loading Google Analytics...');
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-863WB90YC8', {
              send_page_view: true,
              anonymize_ip: true,
              cookie_flags: 'SameSite=None;Secure'
            });
            console.log('[v0] Google Analytics configured');
          `}
        </Script>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
