import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { CopyrightFooter } from "@/components/copyright-footer"

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
        {children}
        <CopyrightFooter />
      </body>
    </html>
  )
}
