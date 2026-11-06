import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../styles/index.css'
import './App.css'
import Providers from './providers'

// thay cho <head> của index.html cũ
export const metadata: Metadata = {
  title: 'react-crud-practice',
  icons: '/favicon.svg',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* font của design: Instrument Serif (heading) + Public Sans (body, weight 400-700) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div id="root">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  )
}
