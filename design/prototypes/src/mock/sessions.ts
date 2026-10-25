// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (docs/product/now-playing.md; checkpoint 4.0b, built at 4.3): who's watching what,
// and how each stream is sent. Positions move with the mock's clock. Each way of sending carries its
// reasons in words, as the server will give them (ADR 0052's device profiles decide them).
import type { AccelerationPath } from './playback.ts'
import type { ClientType, ISODate, MediaItem } from './types.ts'

export type DeliveryMethod = 'direct-play' | 'direct-stream' | 'transcode'

export type StreamSession = {
  id: string
  userId: string
  deviceName: string
  client: ClientType
  itemId: string
  /** The version being played, as the library names it. */
  version: string
  /** A stream to watch, or a copy made for a device to keep (Downloads, C8). */
  kind: 'stream' | 'download'
  state: 'playing' | 'paused'
  /** Seconds into the film; for a download, seconds made so far. */
  position: number
  runtime: number
  method: DeliveryMethod
  /** Why it isn't direct play, one line each. */
  reasons: string[]
  /** What's sent, e.g. "1080p · H.264 · AAC stereo". */
  sent: string
  mbps: number
  network: 'lan' | 'remote'
  address: string
  /** The path transcoding it, or null for the processor; only for transcodes. */
  hardware: AccelerationPath | null
  /** How much faster than playback the transcode runs: below 1, it can't keep up. */
  speed: number
  startedAt: number
  /** The staff member's message when they stopped it. */
  stopped: { by: string; message: string; at: number } | null
}

export type WatchRecord = {
  id: string
  userId: string
  deviceName: string
  client: ClientType
  itemId: string
  method: DeliveryMethod
  network: 'lan' | 'remote'
  startedAt: ISODate
  /** Seconds watched. */
  watched: number
  finished: boolean
}

export type SessionsRuntime = {
  live: StreamSession[]
  history: WatchRecord[]
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export function seedSessions(
  kind: 'populated' | 'empty',
  items: MediaItem[],
  now: number,
): SessionsRuntime {
  if (kind === 'empty') return { live: [], history: [] }
  const runtime = (slug: string) => (items.find((m) => m.id === slug)?.runtimeMinutes ?? 15) * 60
  const live: StreamSession[] = [
    {
      id: 's-livingroom',
      userId: 'u-ines',
      deviceName: 'Living room Apple TV',
      client: 'tvos',
      itemId: 'sintel',
      version: '4K · HEVC · HDR10',
      kind: 'stream',
      state: 'playing',
      position: 412,
      runtime: runtime('sintel'),
      method: 'direct-play',
      reasons: [],
      sent: '4K · HEVC · HDR10 · DTS-HD MA 5.1',
      mbps: 38.4,
      network: 'lan',
      address: '192.168.1.40',
      hardware: null,
      speed: 0,
      startedAt: now - 7 * MIN,
      stopped: null,
    },
    {
      id: 's-ruth-phone',
      userId: 'u-ruth',
      deviceName: 'Ruth’s iPhone',
      client: 'ios',
      itemId: 'tears-of-steel',
      version: '4K · HEVC · Dolby Vision',
      kind: 'stream',
      state: 'playing',
      position: 260,
      runtime: runtime('tears-of-steel'),
      method: 'transcode',
      reasons: [
        'Ruth is away from home, and the 4K file is more than the 8 Mbps allowed there, so it’s sent as 1080p.',
        'Dolby Vision is converted to SDR for the phone’s settings.',
      ],
      sent: '1080p · H.264 · AAC stereo',
      mbps: 7.6,
      network: 'remote',
      address: '84.91.12.7',
      hardware: 'vaapi',
      speed: 2.4,
      startedAt: now - 5 * MIN,
      stopped: null,
    },
    {
      id: 's-theo-web',
      userId: 'u-theo',
      deviceName: 'Chrome on macOS',
      client: 'web',
      itemId: 'big-buck-bunny',
      version: '1080p · H.264',
      kind: 'stream',
      state: 'paused',
      position: 318,
      runtime: runtime('big-buck-bunny'),
      method: 'direct-stream',
      reasons: [
        'Chrome can’t play DTS audio, so the audio is converted to AAC. The picture is sent as it is.',
      ],
      sent: '1080p · H.264 · AAC 5.1',
      mbps: 9.1,
      network: 'lan',
      address: '192.168.1.22',
      hardware: null,
      speed: 0,
      startedAt: now - 18 * MIN,
      stopped: null,
    },
    {
      id: 's-ines-ipad',
      userId: 'u-ines',
      deviceName: 'Ines’s iPhone',
      client: 'ios',
      itemId: 'cosmos-laundromat',
      version: '1080p · HEVC',
      kind: 'download',
      state: 'playing',
      position: 380,
      runtime: runtime('cosmos-laundromat'),
      method: 'transcode',
      reasons: ['Kept on the phone at Downloads’ quality, 1080p at 4 Mbps, to save its space.'],
      sent: '1080p · H.264 · AAC stereo',
      mbps: 4,
      network: 'lan',
      address: '192.168.1.31',
      hardware: 'vaapi',
      speed: 6.8,
      startedAt: now - 2 * MIN,
      stopped: null,
    },
  ]
  const record = (
    id: string,
    userId: string,
    deviceName: string,
    client: ClientType,
    itemId: string,
    method: DeliveryMethod,
    network: 'lan' | 'remote',
    ago: number,
    fraction: number,
  ): WatchRecord[] =>
    items.some((m) => m.id === itemId)
      ? [
          {
            id,
            userId,
            deviceName,
            client,
            itemId,
            method,
            network,
            startedAt: new Date(now - ago).toISOString(),
            watched: Math.round(runtime(itemId) * fraction),
            finished: fraction >= 0.95,
          },
        ]
      : []
  const history: WatchRecord[] = [
    ...record(
      'w-1',
      'u-ines',
      'Living room Apple TV',
      'tvos',
      'tears-of-steel',
      'direct-play',
      'lan',
      2 * HOUR,
      0.35,
    ),
    ...record(
      'w-2',
      'u-ruth',
      'Firefox on Windows',
      'web',
      'metropolis',
      'direct-stream',
      'remote',
      5 * HOUR,
      0.4,
    ),
    ...record(
      'w-3',
      'u-kids',
      'Kids’ room TV',
      'tizen',
      'big-buck-bunny',
      'direct-play',
      'lan',
      20 * HOUR,
      1,
    ),
    ...record(
      'w-4',
      'u-ines',
      'Living room Apple TV',
      'tvos',
      'charade',
      'direct-play',
      'lan',
      20 * HOUR,
      0.74,
    ),
    ...record(
      'w-5',
      'u-kids',
      'Kids’ room TV',
      'tizen',
      'caminandes-llamigos',
      'direct-play',
      'lan',
      DAY + 3 * HOUR,
      1,
    ),
    ...record(
      'w-6',
      'u-ruth',
      'Firefox on Windows',
      'web',
      'his-girl-friday',
      'transcode',
      'remote',
      DAY + 2 * HOUR,
      0.12,
    ),
    ...record('w-7', 'u-theo', 'Pixel 9', 'android', 'spring', 'transcode', 'remote', 3 * DAY, 1),
    ...record(
      'w-8',
      'u-ines',
      'Ines’s iPhone',
      'ios',
      'elephants-dream',
      'direct-stream',
      'remote',
      4 * DAY,
      0.62,
    ),
    ...record(
      'w-9',
      'u-kids',
      'Kids’ room TV',
      'tizen',
      'sintel',
      'direct-play',
      'lan',
      9 * DAY,
      1,
    ),
    ...record(
      'w-10',
      'u-ines',
      'Living room Apple TV',
      'tvos',
      'the-general',
      'direct-play',
      'lan',
      12 * DAY,
      0.18,
    ),
    ...record(
      'w-11',
      'u-theo',
      'Chrome on macOS',
      'web',
      'cosmos-laundromat',
      'direct-play',
      'lan',
      19 * DAY,
      1,
    ),
    ...record(
      'w-12',
      'u-ruth',
      'Firefox on Windows',
      'web',
      'charade',
      'transcode',
      'remote',
      27 * DAY,
      1,
    ),
  ]
  return { live, history }
}

/**
 * One tick of the mock's clock: playing streams move on, a transcode that can't keep up moves
 * slower than the film, and a finished download or a stopped stream (after 10 seconds) leaves.
 */
export function advanceSessions(r: SessionsRuntime, seconds: number, now: number): boolean {
  let changed = false
  for (const s of r.live) {
    if (s.stopped || s.state !== 'playing') continue
    const step = s.kind === 'download' ? seconds * s.speed : seconds * Math.min(1, s.speed || 1)
    s.position = Math.min(s.runtime, s.position + step)
    changed = true
  }
  const before = r.live.length
  r.live = r.live.filter(
    (s) => s.position < s.runtime && !(s.stopped && now - s.stopped.at > 10_000),
  )
  return changed || r.live.length !== before
}

/** A session as the admin shows it: who and what, by name. */
export type SessionView = StreamSession & {
  user: { id: string; displayName: string }
  item: { id: string; title: string; year: number | null; poster: string }
}

export type WatchView = WatchRecord & {
  user: { id: string; displayName: string }
  item: { id: string; title: string; year: number | null; poster: string }
}

export type NowPlaying = {
  sessions: SessionView[]
  /** What's sent in all, in Mbps, and how much of it leaves home. */
  totalMbps: number
  remoteMbps: number
  transcodes: number
}
