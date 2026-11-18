// SPDX-License-Identifier: AGPL-3.0-only
// What the app reports to its own server when something fails (Phase 5's A2a, ADR 0066), once for
// the phone, the TV, the web and the desktop app: an error boundary around the signed-in shell,
// which reports an error no screen handled and offers the way home; in a browser, the page's own
// `error` and `unhandledrejection` events; and a play that failed, with the profile and the
// decision. The sending and its limits are @highsea-tv/client/data's `createReporter`: nothing
// here can throw into the app or send twice for one failure. Reports go to the server the app is
// signed in to and nowhere else.
import { createReporter, type Reporter, type TitleType } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { appVersion, deviceDescription } from '@highsea-tv/native/device'
import type { Playback } from '@highsea-tv/native/playback'
import { useClient } from '@highsea-tv/sdk/react'
import { Button, Text, tokens, useTheme } from '@highsea-tv/ui'
import { router, usePathname } from 'expo-router'
import {
  Component,
  createContext,
  type ErrorInfo,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { View } from 'react-native'
import { useDeviceClient } from '../host'
import { failed } from '../messages.ts'

const ReporterContext = createContext<Reporter | null>(null)

/** The reporter, or null outside the signed-in shell, where there's nobody to report as. */
export const useReporter = () => useContext(ReporterContext)

/**
 * React's error boundary (https://react.dev/reference/react/Component#componentdidcatch): the
 * error and React's component stack go to the reporter, and the screen below is drawn instead of
 * the tree that failed. Pressing its button goes home and draws the app again.
 */
class Boundary extends Component<
  { children: ReactNode; onError: (error: unknown, componentStack: string | null) => void },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError(error, info.componentStack ?? null)
  }

  override render() {
    if (!this.state.failed) return this.props.children
    return <Failed onHome={() => this.setState({ failed: false })} />
  }
}

/** What's drawn when a screen failed: said plainly, with the way home, as +not-found.tsx is laid. */
function Failed({ onHome }: { onHome: () => void }) {
  const t = useT(failed)
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  const pad = tv ? tokens.tv.safe.x * theme.u : tokens.mobile.gutter
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: pad,
        gap: pad / 2,
        backgroundColor: theme.colors.bg,
      }}
    >
      <Text variant={tv ? 'heroTitle' : 'title'} align="center" accessibilityRole="header">
        {t('title')}
      </Text>
      <Text variant={tv ? 'synopsis' : 'body'} color="text-2" align="center">
        {t('body')}
      </Text>
      <View>
        <Button
          variant="primary"
          hasTVPreferredFocus={tv}
          onPress={() => {
            try {
              router.replace('/')
            } catch {
              // the navigator went with the screen: drawing the app again starts it at home
            }
            onHome()
          }}
        >
          {t('home')}
        </Button>
      </View>
    </View>
  )
}

/**
 * Around the signed-in shell: the reporter for this server's client, the boundary, and in a
 * browser the page's own events for what happens outside a render
 * (https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event,
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event).
 */
export function ErrorReports({ children }: { children: ReactNode }) {
  const client = useClient()
  const app = useDeviceClient()
  const pathname = usePathname()
  const screen = useRef(pathname)
  screen.current = pathname
  const reporter = useMemo(
    () =>
      createReporter(
        (body) => client.system.sendClientReport({ body }),
        () => ({ app, version: appVersion, device: deviceDescription() }),
      ),
    [client, app],
  )

  useEffect(() => {
    const page = globalThis as Partial<Pick<Window, 'addEventListener' | 'removeEventListener'>>
    if (typeof page.addEventListener !== 'function') return
    const onError = (e: ErrorEvent) => reporter.error(e.error ?? e.message, screen.current)
    const onRejection = (e: PromiseRejectionEvent) => reporter.error(e.reason, screen.current)
    page.addEventListener('error', onError)
    page.addEventListener('unhandledrejection', onRejection)
    return () => {
      page.removeEventListener?.('error', onError)
      page.removeEventListener?.('unhandledrejection', onRejection)
    }
  }, [reporter])

  return (
    <ReporterContext.Provider value={reporter}>
      <Boundary onError={(error, stack) => reporter.error(error, screen.current, stack)}>
        {children}
      </Boundary>
    </ReporterContext.Provider>
  )
}

/**
 * A play that fails is reported once, with what was asked for, the profile the app named and the
 * server's decision, so it can be reproduced from the report (the plan's A2a).
 */
export function useReportFailedPlay(p: Playback, id: number, type: TitleType) {
  const reporter = useReporter()
  const pathname = usePathname()
  const latest = useRef({ p, pathname })
  latest.current = { p, pathname }
  const hasFailed = p.state.phase === 'failed'
  useEffect(() => {
    if (!hasFailed || !reporter) return
    const { p, pathname } = latest.current
    reporter.play(p.state.error ?? 'The stream failed.', pathname, {
      type: type === 'episode' ? 'episode' : 'movie',
      id,
      versionId: p.version?.id ?? null,
      audioId: p.audio?.id ?? null,
      subtitleId: p.subtitle?.id ?? null,
      profile: p.profile,
      sessionId: p.session?.id ?? null,
      decision: p.session?.decision ?? null,
      position: Number.isFinite(p.state.position) ? Math.max(0, p.state.position) : null,
    })
  }, [hasFailed, reporter, id, type])
}
