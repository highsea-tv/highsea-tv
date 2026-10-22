'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// What every admin page sits in: the API client (same origin, so the session cookie goes with
// every call; ADR 0018) and the design system's provider, with its toasts.
import { createClient } from '@highsea-tv/sdk'
import { ClientProvider } from '@highsea-tv/sdk/react'
import { UIProvider } from '@highsea-tv/ui-web'
import { type ReactNode, useMemo } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  const client = useMemo(() => createClient(), [])
  return (
    <ClientProvider client={client}>
      <UIProvider>{children}</UIProvider>
    </ClientProvider>
  )
}
