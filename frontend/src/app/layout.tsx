import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Providers from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'ValueMax Dealer Portal (Demo)',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-vm-bg font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
