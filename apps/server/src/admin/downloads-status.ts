// SPDX-License-Identifier: AGPL-3.0-only
// A download's state as a badge and a bar (color.md#status-colors), and the queue's filter tabs:
// the prototype's status.ts, in one place for Activity, Downloads, the movie page's queue card and
// the Queue widget. Every state also has a label in each screen's catalog, so color is never the
// only signal.
import type { TorrentState } from '@highsea-tv/api-contract'
import type { BadgeTone, ProgressTone } from '@highsea-tv/ui-web'

export const torrentTone: Record<TorrentState, { tone: BadgeTone; bar: ProgressTone }> = {
  queued: { tone: 'neutral', bar: 'neutral' },
  checking: { tone: 'info', bar: 'neutral' },
  downloading: { tone: 'accent', bar: 'accent' },
  stalled: { tone: 'warning', bar: 'warning' },
  paused: { tone: 'neutral', bar: 'neutral' },
  importing: { tone: 'info', bar: 'success' },
  'import-blocked': { tone: 'danger', bar: 'danger' },
  seeding: { tone: 'success', bar: 'success' },
  completed: { tone: 'success', bar: 'success' },
  error: { tone: 'danger', bar: 'danger' },
}

/** The queue filter tabs: what each one shows. */
export const queueFilters = {
  all: () => true,
  downloading: (s: TorrentState) => s === 'downloading' || s === 'queued' || s === 'checking',
  seeding: (s: TorrentState) => s === 'seeding' || s === 'importing',
  issues: (s: TorrentState) => s === 'stalled' || s === 'import-blocked' || s === 'error',
} satisfies Record<string, (s: TorrentState) => boolean>

export type QueueFilter = keyof typeof queueFilters
