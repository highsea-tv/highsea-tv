// SPDX-License-Identifier: AGPL-3.0-only
// The root of the admin: the document, the theme, the design system's styles, and the API client
// every page reads and writes through (ADR 0018).
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '../src/admin/providers.tsx'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'highsea', template: '%s · highsea' },
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = { themeColor: '#0b0b0c', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="default">
      <body className="bg-bg text-text">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
