// SPDX-License-Identifier: AGPL-3.0-only
// Torrent and indexer states as badges and bars (color.md#status-colors). Every state has a label;
// color is never the only signal.
import type { BadgeTone, ProgressTone } from '@highsea/ui-web'
import type { IndexerHealth, TorrentState } from '../mock/types.ts'

export const torrentStatus: Record<
  TorrentState,
  { label: string; tone: BadgeTone; bar: ProgressTone }
> = {
  queued: { label: 'Queued', tone: 'neutral', bar: 'neutral' },
  checking: { label: 'Checking', tone: 'info', bar: 'neutral' },
  downloading: { label: 'Downloading', tone: 'accent', bar: 'accent' },
  stalled: { label: 'Stalled', tone: 'warning', bar: 'warning' },
  paused: { label: 'Paused', tone: 'neutral', bar: 'neutral' },
  importing: { label: 'Importing', tone: 'info', bar: 'success' },
  'import-blocked': { label: 'Import blocked', tone: 'danger', bar: 'danger' },
  seeding: { label: 'Seeding', tone: 'success', bar: 'success' },
  completed: { label: 'Completed', tone: 'success', bar: 'success' },
  error: { label: 'Error', tone: 'danger', bar: 'danger' },
}

export const indexerStatus: Record<IndexerHealth, { label: string; tone: BadgeTone }> = {
  healthy: { label: 'Healthy', tone: 'success' },
  backoff: { label: 'Backing off', tone: 'warning' },
  failing: { label: 'Failing', tone: 'danger' },
  disabled: { label: 'Disabled', tone: 'neutral' },
}

/** Queue filter tabs: what each one shows. */
export const queueFilters = {
  all: () => true,
  downloading: (s: TorrentState) => s === 'downloading' || s === 'queued' || s === 'checking',
  seeding: (s: TorrentState) => s === 'seeding' || s === 'importing',
  issues: (s: TorrentState) => s === 'stalled' || s === 'import-blocked' || s === 'error',
} satisfies Record<string, (s: TorrentState) => boolean>
