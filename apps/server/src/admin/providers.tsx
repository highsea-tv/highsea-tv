'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// What every admin page sits in: the API client (same origin, so the session cookie goes with
// every call; ADR 0018), Next's router and address for the admin's screens
// (@highsea-tv/admin/navigation.tsx), and the native renderer's theme (the shell holds the
// toasts). Nothing shows until the page has hydrated (the owner's answer of 2026-11-05 to D1's report): the server's render is there for its styles,
// hidden, so a page appears once, laid out at the browser's own width, and with JavaScript off
// the page is only its background.
import { NavigationProvider } from '@highsea-tv/admin/navigation.tsx'
import { createClient } from '@highsea-tv/sdk'
import { ClientProvider } from '@highsea-tv/sdk/react'
import { ThemeProvider } from '@highsea-tv/ui/native'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ReactNode, useMemo, useSyncExternalStore } from 'react'

const never = () => () => {}

/**
 * Whether the page has hydrated: false in the server's render and while hydrating, which React
 * does with the server snapshot, then true
 * (https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  )
}

export function Providers({ children }: { children: ReactNode }) {
  const hydrated = useHydrated()
  const client = useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const navigation = useMemo(
    () => ({
      router: { push: router.push, replace: router.replace },
      pathname,
      // Next's are read-only; the screens only read them
      searchParams: new URLSearchParams(searchParams.toString()),
    }),
    [router, pathname, searchParams],
  )
  return (
    <ClientProvider client={client}>
      <NavigationProvider value={navigation}>
        {/* the library's native drawing, in highsea's default theme (the admin has no other) at
            the device's and window's form factor */}
        <ThemeProvider>
          {/* hidden keeps the layout, so what hydrating measures is what then shows; contents
                adds no box of its own (https://developer.mozilla.org/en-US/docs/Web/CSS/visibility) */}
          <div
            data-hydrated={hydrated || undefined}
            style={{ display: 'contents', visibility: hydrated ? undefined : 'hidden' }}
          >
            {children}
          </div>
        </ThemeProvider>
      </NavigationProvider>
    </ClientProvider>
  )
}
