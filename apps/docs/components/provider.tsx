'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Fumadocs' provider, with the static search dialog and highsea's one (dark) theme.
import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'
import SearchDialog from './search.tsx'

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{ SearchDialog }}
      theme={{ forcedTheme: 'dark', defaultTheme: 'dark', enableSystem: false }}
    >
      {children}
    </RootProvider>
  )
}
