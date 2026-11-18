// SPDX-License-Identifier: AGPL-3.0-only
// What an app tells its own server when something fails (Phase 5's A2a, ADR 0066): an error
// nothing handled, or a play that failed, sent to `POST /system/client-reports` and nowhere else.
// A report must never break the app or loop, so sending never throws, a send that fails is
// dropped and never reported itself, the same failure on the same screen is sent once, and one
// run of the app sends ten at most. Each field is cut to the length the server holds it to.
// No React and no platform here: the shell draws the boundary (apps/client/src/shell/reports.tsx).
import type { ClientReportInput, PlaybackDecision } from '@highsea-tv/api-contract'

/** Reports one run of the app sends at most. */
export const REPORTS_MAX = 10

/** The app, its version and the device, the same for every report it sends. */
export type ReportAbout = Pick<ClientReportInput, 'app' | 'version' | 'device'>

/** A failed play: what was asked for and what the server decided. */
export type FailedPlay = {
  type: 'movie' | 'episode'
  id: number
  versionId: string | null
  audioId: string | null
  subtitleId: string | null
  profile: string | null
  sessionId: string | null
  decision: PlaybackDecision | null
  position: number | null
}

const cut = (s: unknown, max: number) => String(s ?? '').slice(0, max)

function errorOf(e: unknown, componentStack?: string | null): ClientReportInput['error'] {
  const error = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Unknown error')
  return {
    name: cut(error.name || 'Error', 100),
    message: cut(error.message, 2000),
    stack: error.stack ? cut(error.stack, 16_000) : null,
    ...(componentStack ? { componentStack: cut(componentStack, 8000) } : {}),
  }
}

export function createReporter(
  send: (body: ClientReportInput) => Promise<unknown>,
  about: () => ReportAbout,
) {
  const seen = new Set<string>()
  let sent = 0

  function report(body: () => ClientReportInput) {
    try {
      const b = body()
      const key = `${b.kind}|${b.screen}|${b.error.name}|${b.error.message}`
      if (sent >= REPORTS_MAX || seen.has(key)) return
      seen.add(key)
      sent++
      // a report that can't be sent is dropped: it's never worth an error of its own
      Promise.resolve(send(b)).catch(() => {})
    } catch {
      // nor is one that can't be put together
    }
  }

  return {
    /** An error nothing handled, with React's component stack when a boundary caught it. */
    error(e: unknown, screen: string, componentStack?: string | null) {
      report(() => {
        const a = about()
        return {
          kind: 'error',
          app: a.app,
          version: cut(a.version, 32),
          device: cut(a.device, 400),
          screen: cut(screen, 200),
          error: errorOf(e, componentStack),
        }
      })
    },
    /** A play that failed, with the profile and the decision to reproduce it from. */
    play(message: string, screen: string, play: FailedPlay) {
      report(() => {
        const a = about()
        return {
          kind: 'play',
          app: a.app,
          version: cut(a.version, 32),
          device: cut(a.device, 400),
          screen: cut(screen, 200),
          error: { name: 'PlaybackError', message: cut(message, 2000), stack: null },
          play,
        }
      })
    },
  }
}

export type Reporter = ReturnType<typeof createReporter>
