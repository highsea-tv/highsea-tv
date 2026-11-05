// SPDX-License-Identifier: AGPL-3.0-only
// The client's root (one-client-platform.md › A, W7): the providers, then the gate every client
// opens on, on the phone, the TV and the web alike. With no server, Choose a server; with a server
// and nobody signed in on it, its sign-in; then the navigation shell, `(in)`. Expo Router's
// protected routes keep each group out of reach until its guard holds, and send anyone there to
// the phase's first screen (https://docs.expo.dev/router/advanced/protected/); Choose a server
// stays open to everyone, for Add a server. Each server gets its own client, so switching starts
// the client again on it. The web is served by its server, which is known and in use from the
// start (./host.web.ts), and asks it who's signed in by the session cookie, so it opens signed in,
// or on the sign-in after a 401, as apps/web's gate did; in mock mode it opens on Choose a server,
// as the prototype does. The desktop app's export keeps its servers on its Rust side
// (../desktop/tauri.tsx), which opens on the server last used, or on Choose a server. Framed by the prototypes' chrome, the frame sets the form factor and the
// theme (../frame-channel.ts).
import '@highsea-tv/native/intl'
import { I18nProvider } from '@highsea-tv/i18n/react'
import { ServersProvider, useServers } from '@highsea-tv/native/servers'
import { ReachableProvider, SessionContext, useSessionGate } from '@highsea-tv/native/session'
import { useAppTheme } from '@highsea-tv/native/theme'
import { ClientProvider } from '@highsea-tv/sdk/react'
import type { NativeTheme } from '@highsea-tv/tokens/native'
import { ThemeProvider, tokens, useFormFactor, useTheme } from '@highsea-tv/ui'
import {
  type Href,
  router,
  Stack,
  useNavigationContainerRef,
  usePathname,
  useRootNavigationState,
} from 'expo-router'
import { CommonActions } from 'expo-router/react-navigation'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { BackKeys } from '../back.tsx'
import { desktop } from '../desktop/app.ts'
import { WindowChrome } from '../desktop/window.tsx'
import { useBrandFonts } from '../fonts'
import { FrameStateContext, useFrameChannel } from '../frame-channel.ts'
import { HOME_SERVER } from '../host'
import { SaidProvider } from '../kit.tsx'
import { mock, transport } from '../transport.ts'

void SplashScreen.preventAutoHideAsync()

const background = tokens.themes.default.colors.bg

/** The frame's theme while framed: the toolbar's choice outranks the person's own. */
const FramedTheme = createContext<NativeTheme | undefined>(undefined)

const PLAYER_OPTIONS = {
  presentation: 'fullScreenModal',
  animation: 'fade',
  orientation: 'all',
} as const

export default function Layout() {
  const fonts = useBrandFonts()
  const channel = useFrameChannel()
  const launched = useRef(false)
  // Harbor is the mock server's own theme, not a built-in one: the default stands in for it
  const framed = channel.theme
    ? (tokens.themes as Record<string, NativeTheme | undefined>)[channel.theme]
    : undefined
  if (!fonts) return null
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: background }}>
      <SafeAreaProvider>
        <I18nProvider locale="en">
          <Servers>
            <ThemeProvider
              formFactor={channel.formFactor}
              theme={framed}
              fontScale={channel.fontScale}
              reducedMotion={channel.reducedMotion}
            >
              <FramedTheme.Provider value={framed}>
                <FrameStateContext.Provider value={channel.toolbar}>
                  {/* tvOS has no status bar */}
                  {Platform.isTV ? null : <StatusBar style="light" />}
                  <SaidProvider>
                    <Launched.Provider value={launched}>
                      <Root />
                    </Launched.Provider>
                  </SaidProvider>
                </FrameStateContext.Provider>
              </FramedTheme.Provider>
            </ThemeProvider>
          </Servers>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/**
 * The servers this client knows: the desktop app's Rust side in its own export (../desktop/
 * tauri.tsx), and otherwise @highsea-tv/native's, with the mock's server and nearby servers in
 * mock mode.
 */
function Servers({ children }: { children: ReactNode }) {
  if (desktop) return <desktop.DesktopRoot>{children}</desktop.DesktopRoot>
  return (
    <ServersProvider
      fetch={transport}
      home={mock ? undefined : HOME_SERVER}
      nearby={mock?.transport.nearby}
    >
      {children}
    </ServersProvider>
  )
}

type Phase = 'connect' | 'signIn' | 'in'

function Root() {
  const { ready, current } = useServers()
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])
  if (!ready) return null
  if (!current) return <Nav phase="connect" />
  // a new client per server and per sign-in or sign-out
  return (
    <ClientProvider key={`${current.server.id}:${current.round}`} client={current.client}>
      {current.signedIn ? <SignedInGate /> : <Nav phase="signIn" />}
    </ClientProvider>
  )
}

function SignedInGate() {
  const { signedOut, current } = useServers()
  // the first answer decides the screen (@highsea-tv/native/session's useSessionGate): a refused
  // token is dropped; on the web with no token, the cookie's 401 is the sign-in
  const gate = useSessionGate(current?.token ? () => void signedOut() : null)
  if (gate.phase === 'wait') return null
  if (gate.phase === 'signIn') return <Nav phase="signIn" />
  // an unreachable server still opens the shell, which says so
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

/** The person's theme once they're in, unless the prototypes' toolbar has chosen one. */
function Themed({ children }: { children: ReactNode }) {
  const framed = useContext(FramedTheme)
  const theme = useAppTheme()
  return <ThemeProvider theme={framed ?? theme}>{children}</ThemeProvider>
}

/** Whether a root route is one of the player's (a film's or an episode's). */
const isPlayer = (name: string) => name.startsWith('play/')

/**
 * A link opened over the player (a `highsea://` link, a notification, the prototypes' chrome)
 * closes it and goes where it points, stopping playback as Back does (B2's answer 1). Expo Router
 * opens an incoming link as a NAVIGATE to its address, which pushes the shell again above the
 * player's modal, so the player would stay drawn over it; once the place a link went is on top,
 * the player's routes below it are taken out with React Navigation's `reset`, as its docs remove
 * a screen from a stack (https://reactnavigation.org/docs/navigation-actions/#reset), and the
 * player unmounts and ends its session.
 */
function useLinkLeavesPlayer(pathname: string) {
  const ref = useNavigationContainerRef()
  useEffect(() => {
    if (pathname.startsWith('/play/')) return
    const stack = ref.getRootState()?.routes[0]?.state
    if (!stack?.key || !stack.routes.some((r) => isPlayer(r.name))) return
    const routes = stack.routes.filter((r) => !isPlayer(r.name))
    ref.dispatch({
      ...CommonActions.reset({ ...stack, routes, index: routes.length - 1 } as never),
      target: stack.key,
    })
  }, [pathname, ref])
}

/** Each phase's first screen. */
const starts: Record<Phase, Href> = { connect: '/connect', signIn: '/sign-in', in: '/' }

/** The gate's own screens, which a signed-in client only reaches by asking (Add a server). */
const GATE = new Set(['/connect', '/sign-in'])

/**
 * Whether a Nav has mounted before in this run of the app: only the client's first keeps the path
 * it opened on. The app's root holds it, so every launch (and every test's render) starts afresh.
 */
const Launched = createContext<{ current: boolean }>({ current: false })

function Nav({ phase }: { phase: Phase }) {
  const pathname = usePathname()
  const navigation = useRootNavigationState()
  const arrived = useRef(false)
  const launched = useContext(Launched)
  const theme = useTheme()
  const tv = useFormFactor().input === 'tv'
  // A new phase, or a new server, mounts a new Nav, which opens wherever its navigator lands.
  // Start it on the phase's own screen once the navigator is ready
  // (https://docs.expo.dev/router/reference/redirects/). The first Nav keeps an address it was
  // opened at (a link, or the prototypes' chrome at /settings), unless it's the gate's.
  useEffect(() => {
    if (arrived.current || !navigation?.key) return
    arrived.current = true
    const first = !launched.current
    launched.current = true
    if (phase === 'connect' || pathname === starts[phase]) return
    if (first && phase === 'in' && !GATE.has(pathname)) return
    // a screen this phase's guard holds closed is sent to its first screen by the guard's own
    // redirect: going there from here too would open it twice (and the TV would ask for two codes)
    if (phase === 'signIn' ? !GATE.has(pathname) : pathname === '/sign-in') return
    router.replace(starts[phase])
  }, [navigation?.key, phase, pathname, launched])
  useLinkLeavesPlayer(pathname)
  // A screen the guard holds closed goes to this phase's first, not the navigator's anchor.
  const start = starts[phase]
  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: tv ? 'fade' : undefined,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Protected guard={phase === 'signIn'} redirectTo={start}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'in'} redirectTo={start}>
        <Stack.Screen name="(in)" />
        {/* the player turns with the phone, over everything, and fades in (player.md › Phone) */}
        <Stack.Screen name="play/[id]/index" options={PLAYER_OPTIONS} />
        <Stack.Screen name="play/[id]/start" options={PLAYER_OPTIONS} />
        <Stack.Screen name="play/episode/[id]/index" options={PLAYER_OPTIONS} />
        <Stack.Screen name="play/episode/[id]/start" options={PLAYER_OPTIONS} />
      </Stack.Protected>
      <Stack.Screen name="connect" />
      <Stack.Screen name="+not-found" />
    </Stack>
  )
  if (tv) return <BackKeys>{stack}</BackKeys>
  // the desktop app's window chrome above every screen but the player, which lays it over the
  // film itself (WindowChrome's `overlay`); on a Mac, where there's no top bar, a strip moves the
  // window. Nothing outside the desktop app
  if (pathname.startsWith('/play/')) return stack
  return (
    <View style={{ flex: 1 }}>
      <WindowChrome drag={phase !== 'in' || GATE.has(pathname)} />
      <View style={{ flex: 1 }}>{stack}</View>
    </View>
  )
}
