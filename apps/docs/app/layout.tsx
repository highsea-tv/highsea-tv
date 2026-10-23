// SPDX-License-Identifier: AGPL-3.0-only
// The documentation site's root: the document, highsea's theme and Fumadocs' provider.
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Provider } from '@/components/provider.tsx'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'highsea docs', template: '%s · highsea docs' },
  description: 'How to install highsea, set it up and keep it running.',
  metadataBase: new URL('https://docs.highsea.tv'),
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = { themeColor: '#0b0b0c', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="default" className="dark" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
