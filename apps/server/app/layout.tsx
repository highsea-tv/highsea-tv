// SPDX-License-Identifier: AGPL-3.0-only
// The root of the admin: the document, the theme, the design system's styles, and the API client
// every page reads and writes through (ADR 0018).

import { polyfillAnimationFrame } from '@highsea-tv/ui/next/server'
import { StyleRegistry } from '@highsea-tv/ui/next/style-registry'
import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { Providers } from '../src/admin/providers.tsx'
import './globals.css'

// the library's server render needs a frame scheduler (@highsea-tv/ui/next/server says why); here
// rather than in instrumentation, which the build's prerender doesn't run
polyfillAnimationFrame()

export const metadata: Metadata = {
  title: { default: 'highsea', template: '%s · highsea' },
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = { themeColor: '#0b0b0c', colorScheme: 'dark' }

export default async function RootLayout({ children }: { children: ReactNode }) {
  // every page is rendered per request, its 404 included: the admin's screens read the address's
  // search (Providers' useSearchParams), which a page rendered ahead of time can't
  // (https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout)
  await connection()
  return (
    <html lang="en" data-theme="default">
      <body>
        <StyleRegistry>
          <Providers>{children}</Providers>
        </StyleRegistry>
      </body>
    </html>
  )
}
