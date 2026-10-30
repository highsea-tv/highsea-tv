// SPDX-License-Identifier: AGPL-3.0-only
// The TV app (C1 to C7, ADR 0059), one for Apple TV and Android TV: shared code asks
// `Platform.isTV`, never the OS, and only discovery and the player have per-platform parts. The
// gate is the phone's: with no server, or nobody signed in on it, C1 (connect.tsx, which picks a
// server and signs in by code); then the screens. A server that stops answering shows Unreachable
// in their place, as the prototype's tv-app.tsx does. Screens are sized in units of 1% of the
// screen's width (ThemeProvider's `tv` platform), as the prototype's cqw.
import '@highsea-tv/native/intl'
import type { CurrentSession } from '@highsea-tv/api-contract'
import { useSession } from '@highsea-tv/client/data'
import { I18nProvider, useT } from '@highsea-tv/i18n/react'
import { ServersProvider, useCurrent, useServers } from '@highsea-tv/native/servers'
import {
  ReachableContext,
  SessionContext,
  unreachable,
  useReachable,
  useReachableState,
} from '@highsea-tv/native/session'
import { useAppTheme } from '@highsea-tv/native/theme'
import { ApiError } from '@highsea-tv/sdk'
import { ClientProvider } from '@highsea-tv/sdk/react'
import { ThemeProvider, tokens, useTheme } from '@highsea-tv/ui-native'
import { TvButton, TvMessage } from '@highsea-tv/ui-native/tv'
import { type Href, router, Stack, usePathname, useRootNavigationState } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useForget } from '../forget.ts'
import { Foot, ServerIdentity } from '../kit.tsx'
import { forget as forgetMessages, shell } from '../messages.ts'
import { Remote } from '../remote.tsx'

void SplashScreen.preventAutoHideAsync()

const background = tokens.themes.default.colors.bg

export default function Layout() {
  return (
    <View style={{ flex: 1, backgroundColor: background }}>
      <I18nProvider locale="en">
        <ServersProvider>
          <Root />
        </ServersProvider>
      </I18nProvider>
    </View>
  )
}

type Phase = 'connect' | 'in'

function Root() {
  const { ready, current } = useServers()
  if (!ready) return null
  const connect = (
    <ThemeProvider platform="tv">
      <Remote signedIn={false}>
        <Nav phase="connect" />
      </Remote>
    </ThemeProvider>
  )
  if (!current) return connect
  if (!current.token)
    return (
      <ClientProvider key={current.server.id} client={current.client}>
        {connect}
      </ClientProvider>
    )
  // a new client per server and per sign-in
  return (
    <ClientProvider key={`${current.server.id}:${current.token}`} client={current.client}>
      <SignedInGate />
    </ClientProvider>
  )
}

function SignedInGate() {
  const session = useSession()
  const { signedOut } = useServers()
  const refused =
    session.status === 'error' && session.error instanceof ApiError && session.error.status === 401
  const [settled, setSettled] = useState(false)
  const last = useRef<CurrentSession | null>(null)
  if (session.status === 'success') last.current = session.data
  useEffect(() => {
    if (session.status !== 'loading') setSettled(true)
  }, [session.status])

  // a token the server no longer knows (signed out from Settings › Devices): drop it, and sign in
  useEffect(() => {
    if (refused) void signedOut()
  }, [refused, signedOut])

  if (!settled || refused) return null
  if (!last.current && session.status === 'error' && !unreachable(session.error))
    return (
      <ThemeProvider platform="tv">
        <Remote signedIn={false}>
          <Nav phase="connect" />
        </Remote>
      </ThemeProvider>
    )
  return (
    <SessionContext.Provider value={last.current}>
      <Reachable missing={!last.current} refetch={session.refetch}>
        <Themed>
          <Remote signedIn>
            <Nav phase="in" />
          </Remote>
        </Themed>
      </Reachable>
    </SessionContext.Provider>
  )
}

/** Unreachable while the server doesn't answer, or answered nobody's session yet. */
function Reachable({
  missing,
  refetch,
  children,
}: {
  missing: boolean
  refetch: () => void
  children: ReactNode
}) {
  const reachable = useReachable()
  const again = useRef(refetch)
  again.current = refetch
  useEffect(() => {
    if (missing && !reachable.offline) again.current()
  }, [missing, reachable.offline])
  const value = useMemo(
    () => ({
      offline: missing || reachable.offline,
      retry: () => {
        reachable.retry()
        if (missing) again.current()
      },
    }),
    [missing, reachable],
  )
  return <ReachableContext.Provider value={value}>{children}</ReachableContext.Provider>
}

function Themed({ children }: { children: ReactNode }) {
  const theme = useAppTheme()
  return (
    <ThemeProvider theme={theme} platform="tv">
      {children}
    </ThemeProvider>
  )
}

const starts: Record<Phase, Href> = { connect: '/connect', in: '/' }

function Nav({ phase }: { phase: Phase }) {
  const pathname = usePathname()
  const navigation = useRootNavigationState()
  const arrived = useRef(false)
  const { offline } = useReachableState()
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])
  // a new phase mounts a new Nav: start it on the phase's own screen once the navigator is ready
  // (https://docs.expo.dev/router/reference/redirects/)
  useEffect(() => {
    if (arrived.current || !navigation?.key) return
    arrived.current = true
    if (pathname !== starts[phase] && !(phase === 'in' && pathname === '/connect'))
      router.replace(starts[phase])
  }, [navigation?.key, phase, pathname])
  const start = starts[phase]
  // the navigator's own background is React Navigation's light default; screens sit on the theme's
  const theme = useTheme()
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Protected guard={phase === 'in'} redirectTo={start}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Screen name="connect" />
      </Stack>
      {phase === 'in' && offline && pathname !== '/connect' ? <Unreachable /> : null}
    </>
  )
}

/** The server doesn't answer (tv-app.tsx's Unreachable), with Forget this server at its foot. */
function Unreachable() {
  const t = useT(shell)
  const f = useT(forgetMessages)
  const { retry } = useReachableState()
  const current = useCurrent()
  const forget = useForget()
  const name = current.server.name
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]}>
      <ServerIdentity />
      <TvMessage
        title={t('unreachableTitle', { name })}
        actions={
          <>
            <TvButton primary preferred icon="refresh" onPress={retry}>
              {t('tryAgain')}
            </TvButton>
            <TvButton icon="server" onPress={() => router.push('/connect')}>
              {t('anotherServer')}
            </TvButton>
          </>
        }
      >
        {t('unreachableBody', { name })}
      </TvMessage>
      <Foot>
        <TvButton icon="delete" onPress={() => forget(current.server.id, name)}>
          {f('thisServer')}
        </TvButton>
      </Foot>
    </View>
  )
}
