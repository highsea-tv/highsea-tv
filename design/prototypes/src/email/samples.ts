// SPDX-License-Identifier: AGPL-3.0-only
// The emails the preview shows, on Harbor (or a server left named highsea), rendered by the
// server's own templates (@highsea-tv/notifications/mail). Each notification's title, body and level
// are what @highsea-tv/notifications' `render()` says for `payload`; the browser can't import that
// entry (it reaches the database schema), so the words are written out here and
// test/emails.test.ts renders each payload to check they still match. The details come from the
// payload as the server derives them (`emailDetails`).
import { posterArt } from '@highsea-tv/fixtures'
import {
  type Brand,
  type EventKind,
  emailDetails,
  type Level,
  type RenderedEmail,
  renderLinkEmail,
  renderNotificationEmail,
} from '@highsea-tv/notifications/mail'

export type SampleId =
  | 'invite'
  | 'reset'
  | 'imported'
  | 'upgraded'
  | 'grabbed'
  | 'download-failed'
  | 'subtitle-added'
  | 'health'
  | 'health-cleared'
  | 'update'
  | 'movie-added'
  | 'test'

type NotificationSample = {
  event: EventKind
  level: Level
  title: string
  body: string
  /** What `render()` is given, to check the words against. */
  payload: Parameters<typeof emailDetails>[1]
  /** The movie the poster and Open go to, if any. */
  movie?: { title: string; path: string }
  /** Open goes here when the movie has none (Settings, System). */
  path?: string
}

const SINTEL = { title: 'Sintel', year: 2010, tmdbId: 45745 }
const BUNNY = { title: 'Big Buck Bunny', year: 2008, tmdbId: 10378 }
const TEARS = { title: 'Tears of Steel', year: 2012, tmdbId: 133701 }

export const notificationSamples: Record<
  Exclude<SampleId, 'invite' | 'reset'>,
  NotificationSample
> = {
  imported: {
    event: 'imported',
    level: 'success',
    title: 'Sintel (2010) is in the library',
    body: 'Bluray-1080p, 1.2 GB.',
    payload: { movie: SINTEL, quality: 'Bluray-1080p', size: 1_200_000_000, upgradedFrom: null },
    movie: { title: 'Sintel', path: '/movies/45745' },
  },
  upgraded: {
    event: 'upgraded',
    level: 'success',
    title: 'Big Buck Bunny (2008) was upgraded',
    body: 'WEB 1080p to Bluray-2160p, 14.8 GB.',
    payload: {
      movie: BUNNY,
      quality: 'Bluray-2160p',
      size: 14_800_000_000,
      upgradedFrom: 'WEB 1080p',
    },
    movie: { title: 'Big Buck Bunny', path: '/movies/10378' },
  },
  grabbed: {
    event: 'grabbed',
    level: 'info',
    title: 'Grabbed Tears of Steel (2012)',
    body: 'Tears.of.Steel.2012.1080p.WEB-DL.DDP5.1.H.264-GRP from Nyaa, 3.1 GB.',
    payload: {
      movie: TEARS,
      release: 'Tears.of.Steel.2012.1080p.WEB-DL.DDP5.1.H.264-GRP',
      indexer: 'Nyaa',
      size: 3_100_000_000,
    },
    movie: { title: 'Tears of Steel', path: '/movies/133701' },
  },
  'download-failed': {
    event: 'download-failed',
    level: 'warning',
    title: 'Tears of Steel (2012) didn’t download',
    body: 'Tears.of.Steel.2012.1080p.WEB-DL.DDP5.1.H.264-GRP: it stalled for 6 hours with no peers. Another release was grabbed in its place.',
    payload: {
      movie: TEARS,
      release: 'Tears.of.Steel.2012.1080p.WEB-DL.DDP5.1.H.264-GRP',
      reason: 'it stalled for 6 hours with no peers.',
      replaced: true,
    },
    movie: { title: 'Tears of Steel', path: '/movies/133701' },
  },
  'subtitle-added': {
    event: 'subtitle-added',
    level: 'info',
    title: 'French subtitles for Sintel (2010)',
    body: 'Synced to the audio.',
    payload: { movie: SINTEL, language: 'French', synced: true },
    movie: { title: 'Sintel', path: '/movies/45745' },
  },
  health: {
    event: 'health',
    level: 'warning',
    title: 'Disk space needs attention',
    body: '/data/media has 18 GB free, under the 50 GB you set.',
    payload: {
      level: 'warning',
      source: 'Disk space',
      message: '/data/media has 18 GB free, under the 50 GB you set.',
      cleared: false,
    },
    path: '/system/health',
  },
  'health-cleared': {
    event: 'health',
    level: 'success',
    title: 'Disk space is fine again',
    body: 'This has cleared: /data/media has 18 GB free, under the 50 GB you set.',
    payload: {
      level: 'warning',
      source: 'Disk space',
      message: '/data/media has 18 GB free, under the 50 GB you set.',
      cleared: true,
    },
    path: '/system/health',
  },
  update: {
    event: 'update',
    level: 'info',
    title: 'highsea 0.2.0 is available',
    body: 'System › Updates has what’s new.',
    payload: { version: '0.2.0' },
    path: '/system/updates',
  },
  'movie-added': {
    event: 'movie-added',
    level: 'info',
    title: '4 movies were added',
    body: 'From Blender Open Movies: Sintel (2010), Big Buck Bunny (2008), Tears of Steel (2012) and 1 other.',
    payload: {
      count: 4,
      source: 'Blender Open Movies',
      movies: [SINTEL, BUNNY, TEARS],
      by: 'list',
    },
    movie: { title: 'Sintel', path: '/wanted' },
  },
  test: {
    event: 'test',
    level: 'info',
    title: 'A test from highsea',
    body: 'This connection works. Messages you choose will arrive here.',
    payload: {},
  },
}

export const sampleIds: SampleId[] = [
  'invite',
  'reset',
  ...(Object.keys(notificationSamples) as SampleId[]),
]

export const sampleLabels: Record<SampleId, string> = {
  invite: 'Invite',
  reset: 'Password reset',
  imported: 'Imported',
  upgraded: 'Upgraded',
  grabbed: 'Grabbed',
  'download-failed': 'Download failed',
  'subtitle-added': 'Subtitle added',
  health: 'Health warning',
  'health-cleared': 'Health cleared',
  update: 'Update available',
  'movie-added': 'Movies added by a list',
  test: 'Test',
}

export const HARBOR_URL = 'https://harbor.example.net'
/** When the email preview pretends it's now: links expire seven days later. */
export const SENT_AT = Date.UTC(2026, 9, 21, 18, 30)

/** One sample, rendered for a server: its name, its external URL or none, its logo. */
export function renderSample(
  id: SampleId,
  o: { server: string; externalUrl: string | null; logo: string },
): RenderedEmail {
  const brand: Brand = { ...o, timeZone: 'Europe/London' }
  const base = o.externalUrl ?? 'http://192.168.1.20:3000'
  if (id === 'invite' || id === 'reset')
    return renderLinkEmail(brand, {
      kind: id,
      name: id === 'invite' ? 'Mara' : 'Theo',
      inviter: 'Ines',
      link: `${base}/${id === 'invite' ? 'invite' : 'reset'}/k3V9qTzW7xYb2LmP`,
      expiresAt: SENT_AT + (id === 'invite' ? 7 : 1) * 86_400_000,
    })
  const s = notificationSamples[id]
  const target = s.movie?.path ?? s.path
  return renderNotificationEmail(brand, {
    event: s.event,
    level: s.level,
    title: s.title,
    body: s.body,
    connection: 'Ines’s email',
    url: o.externalUrl && target ? `${o.externalUrl}${target}` : null,
    image: s.movie ? posterArt(s.movie.title) : null,
    details: emailDetails(s.event, s.payload),
  })
}
