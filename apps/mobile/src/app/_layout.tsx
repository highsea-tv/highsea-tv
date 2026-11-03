// SPDX-License-Identifier: AGPL-3.0-only
// The phone app (C1 to C8, ADR 0059). The gate comes first, as on the web (apps/web/src/app.tsx)
// and in the desktop app: with no server, Choose a server; with a server and nobody signed in on
// it, its sign-in; then the tabs. Expo Router's protected routes keep each group out of reach
// until its guard holds, and send anyone there to the first screen that is
// (https://docs.expo.dev/router/advanced/protected/). Choose a server stays open to everyone, for
// Add a server. Each server gets its own client, so switching starts the app again on it.
import '@highsea-tv/native/intl'
import { I18nProvider } from '@highsea-tv/i18n/react'
import { ServersProvider, useServers } from '@highsea-tv/native/servers'
import { ReachableProvider, SessionContext, useSessionGate } from '@highsea-tv/native/session'
import { useAppTheme } from '@highsea-tv/native/theme'
import { ClientProvider } from '@highsea-tv/sdk/react'
import { ThemeProvider, tokens } from '@highsea-tv/ui'
import { type Href, router, Stack, usePathname, useRootNavigationState } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { type ReactNode, useEffect, useRef } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

void SplashScreen.preventAutoHideAsync()

const background = tokens.themes.default.colors.bg

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: background }}>
      <SafeAreaProvider>
        <I18nProvider locale="en">
          <ServersProvider>
            <StatusBar style="light" />
            <Root />
          </ServersProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

type Phase = 'connect' | 'signIn' | 'in'

function Root() {
  const { ready, current } = useServers()
  if (!ready) return null
  if (!current)
    return (
      <ThemeProvider>
        <Nav phase="connect" />
      </ThemeProvider>
    )
  // a new client per server and per sign-in
  return (
    <ClientProvider key={`${current.server.id}:${current.token ?? ''}`} client={current.client}>
      {current.token ? (
        <SignedInGate />
      ) : (
        <ThemeProvider>
          <Nav phase="signIn" />
        </ThemeProvider>
      )}
    </ClientProvider>
  )
}

function SignedInGate() {
  const { signedOut } = useServers()
  // the first answer decides the screen (@highsea-tv/native/session's useSessionGate)
  const gate = useSessionGate(() => void signedOut())
  if (gate.phase === 'wait') return null
  // an unreachable server still opens the tabs, which say so (the prototype's Unreachable)
  if (gate.phase === 'signIn')
    return (
      <ThemeProvider>
        <Nav phase="signIn" />
      </ThemeProvider>
    )
  return (
    <SessionContext.Provider value={gate.session}>
      <ReachableProvider missing={!gate.session} refetch={gate.refetch}>
        <Themed>
          <Nav phase="in" />
        </Themed>
      </ReachableProvider>
    </SessionContext.Provider>
  )
}

function Themed({ children }: { children: ReactNode }) {
  const theme = useAppTheme()
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}

/** Each phase's first screen. */
const starts: Record<Phase, Href> = { connect: '/connect', signIn: '/sign-in', in: '/' }

/** Where a new Nav moves to: its phase's first screen, unless it's there (or choosing a server). */
function arrival(phase: Phase, pathname: string): Href | null {
  if (phase === 'connect' || pathname === starts[phase]) return null
  return starts[phase]
}

/** Whether a Nav has mounted before: only the app's first keeps the path it opened on. */
let launched = false

function Nav({ phase }: { phase: Phase }) {
  const pathname = usePathname()
  const navigation = useRootNavigationState()
  const arrived = useRef(false)
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])
  // A new phase, or a new server, mounts a new Nav, which opens wherever its navigator lands:
  // Choose a server (open to every phase), or a tab other than Home. Start it on the phase's own
  // screen once the navigator is ready (https://docs.expo.dev/router/reference/redirects/). The
  // app's first Nav keeps a link it was opened with (highsea://link/…), unless it's another
  // phase's screen.
  useEffect(() => {
    if (arrived.current || !navigation?.key) return
    arrived.current = true
    const first = !launched
    launched = true
    if (first && phase === 'in' && pathname !== '/connect' && pathname !== '/sign-in') return
    const to = arrival(phase, pathname)
    if (to) router.replace(to)
  }, [navigation?.key, phase, pathname])
  // A screen the guard holds closed goes to this phase's first, not the navigator's anchor (the
  // first route by file name, Choose a server); `redirectTo` is ProtectedProps' in Expo Router 58.
  const start = starts[phase]
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
      <Stack.Protected guard={phase === 'signIn'} redirectTo={start}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'in'} redirectTo={start}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="play/[id]"
          options={{ presentation: 'fullScreenModal', animation: 'fade', orientation: 'all' }}
        />
        <Stack.Screen name="link/index" />
        <Stack.Screen name="link/[code]" />
      </Stack.Protected>
      <Stack.Screen name="connect" />
    </Stack>
  )
}
