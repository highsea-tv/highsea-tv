// SPDX-License-Identifier: AGPL-3.0-only
// The root of the admin: the document, the theme and the design system's styles. The shell and
// its data come from client components (ADR 0018).
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'highsea', template: '%s · highsea' },
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = { themeColor: '#0b0b0c', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="default">
      <body className="bg-bg text-text">{children}</body>
    </html>
  )
}
