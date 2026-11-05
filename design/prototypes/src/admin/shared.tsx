// SPDX-License-Identifier: AGPL-3.0-only
// The admin's shared screens in the prototype (one-client-platform-d.md › D1): the same
// `@highsea-tv/admin` code the server's admin draws, here on the SDK over `@highsea-tv/mock`'s
// transport, answering from the screen's own mock so the toolbar's data, role and clock apply.
// The prototype's frame keeps its chrome; inside it, the page is the admin's. Each page moves here
// as its batch moves it; since D1 that's the shell and System › Status.

import { NavigationProvider } from '@highsea-tv/admin/navigation.tsx'
import { AdminShell } from '@highsea-tv/admin/shell.tsx'
import { System } from '@highsea-tv/admin/system.tsx'
import { userFor } from '@highsea-tv/mock/mock'
import { browserStorage, createMockFetch, type MockTransport } from '@highsea-tv/mock/transport'
import { createClient, type HighseaClient } from '@highsea-tv/sdk'
import { ClientProvider } from '@highsea-tv/sdk/react'
import { ThemeProvider } from '@highsea-tv/ui/native'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { useMock, useProto } from '../screen/screen.tsx'

/** The seed's people by id (packages/mock/src/seed.ts), for signing in as the toolbar's role. */
const USERNAMES: Record<string, string> = { 'u-ines': 'ines', 'u-theo': 'theo', 'u-ruth': 'ruth' }

/**
 * Signs the page's browser in as the toolbar's role, as someone would at `/login`: the mock takes
 * any password, and the owner's second factor any six digits but zeros (packages/mock/src/server.ts).
 */
async function signIn(client: HighseaClient, username: string) {
  const r = await client.auth.signIn({ body: { username, password: 'prototype' } })
  if (r.status === 'two-factor')
    await client.auth.twoFactor({ body: { challenge: r.challenge, code: '123456' } })
}

function Host({ children }: { children: ReactNode }) {
  const mock = useMock()
  const state = useProto()
  const [location, navigate] = useLocation()
  const search = useSearch()
  // one transport per mock, made with the toolbar's state it opened on; its changes follow below
  const initial = useRef(state).current
  const transport: MockTransport = useMemo(
    () =>
      createMockFetch({
        mock,
        storage: browserStorage,
        origin: window.location.origin,
        state: initial,
      }),
    [mock, initial],
  )
  // never disposed: it lives as long as the page's mock, and Strict Mode's second effect pass
  // (https://react.dev/reference/react/StrictMode) would dispose the one useMemo keeps
  useEffect(() => transport.setState(state), [transport, state])
  const client = useMemo(() => createClient({ fetch: transport }), [transport])

  // the session for the toolbar's role, made before the shell asks for anything
  const [ready, setReady] = useState<string | null>(null)
  const want = USERNAMES[userFor(state.role)] ?? 'theo'
  useEffect(() => {
    let live = true
    client.auth
      .session()
      .then(
        (s) => (s.user.username === want ? null : signIn(client, want)),
        () => signIn(client, want),
      )
      // with the toolbar's error state the server doesn't answer: the shell shows it, as it would
      .catch(() => {})
      .then(() => live && setReady(want))
    return () => {
      live = false
    }
  }, [client, want])

  const navigation = useMemo(
    () => ({
      router: {
        push: (href: string) => navigate(href),
        replace: (href: string) => navigate(href, { replace: true }),
      },
      pathname: location,
      searchParams: new URLSearchParams(search),
    }),
    [location, search, navigate],
  )
  // a user is sent to the web app, as the server's admin layout and the prototype's shell send them
  const role = state.role
  useEffect(() => {
    if (role === 'user') navigate('~/web', { replace: true })
  }, [role, navigate])
  if (role === 'user' || ready !== want) return null
  return (
    <ClientProvider client={client}>
      <NavigationProvider value={navigation}>
        <ThemeProvider>
          <AdminShell role={role}>{children}</AdminShell>
        </ThemeProvider>
      </NavigationProvider>
    </ClientProvider>
  )
}

/** System › Status, the admin's own (packages/admin/src/system.tsx). */
export function SharedSystemStatus() {
  return (
    <Host>
      <System tab="status" />
    </Host>
  )
}
