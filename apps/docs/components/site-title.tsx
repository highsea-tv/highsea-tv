'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The site's title: the library's lockup, from live text and a live mark (docs/brand/logo.md),
// drawn through react-native-web in highsea's default theme, the site's only one (globals.css).
// Fumadocs renders the title twice, in the mobile header and the sidebar. Rendered on the server,
// both would be one tree with one `useId`, so the visible mark's gradient and mask would point at
// the hidden copy and paint nothing; as a client component each copy gets its own ids.
import { Lockup, ThemeProvider } from '@highsea-tv/ui/native'

export function SiteTitle() {
  return (
    <ThemeProvider>
      <Lockup size={17} />
    </ThemeProvider>
  )
}
