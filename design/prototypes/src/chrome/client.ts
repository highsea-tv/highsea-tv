// SPDX-License-Identifier: AGPL-3.0-only
// The chrome's routes apps/client holds (one-client-platform.md › A, one-client-platform-b.md
// › B3): since B3 every client platform's route. A frame there shows the client's mock web export
// (served at /web by ../../client-export.ts); the prototype draws no client screen of its own.
//
// The chrome's route for a client route is the platform's prefix and the client's own path:
// `#/mobile/connect` is the client at `/connect` in the phone's frame, and the client's `/` is
// `#/mobile`. Once a frame holds the client, the routes it reports keep it there (signing in goes
// on to the client's Home).
import { createT, defineMessages } from '@highsea-tv/i18n'
import { type Input, TV_REFERENCE } from '@highsea-tv/tokens'
import type { Platform } from '../proto/state.ts'

/**
 * The prototypes' addresses the client keeps under another: the phone's Collections view is
 * `/library?view=collections` in apps/client (src/library/library.tsx).
 */
const CLIENT_ALIASES: Record<string, string> = {
  '/library/collections': '/library?view=collections',
  // the phone's Shows view (B3)
  '/library/shows': '/library?view=shows',
  // the phone's Music view and its own views (B3)
  '/library/music': '/library?view=music',
  '/library/music/artists': '/library?view=music&music=artists',
  '/library/music/songs': '/library?view=music&music=songs',
  '/library/music/playlists': '/library?view=music&music=playlists',
  // the phone's You is the client's Settings, its account above the list (B2), and its Switch
  // profile sheet is Settings' `?who=1` (B3)
  '/you': '/settings',
  '/you/who': '/settings?who=1',
  // the TV's opening, Who's watching as highsea opens (B3)
  '/start': '/who?launch=1',
}

export type ClientPlatform = Exclude<Platform, 'admin'>

/** Each frame's input: the width class comes from the frame's own size (the form-factor rule). */
export const FRAME_INPUTS: Record<ClientPlatform, Input> = {
  web: 'pointer',
  mobile: 'touch',
  tv: 'tv',
}

/** The phone's frame: an iPhone's 390 × 844 points, the stage's device and the sweeps' viewport. */
export const PHONE_SCREEN = { w: 390, h: 844 } as const

/** The TV's frame is a 1080p screen, drawn scaled to fit (tv.md › Units). */
export const TV_SCREEN = { w: TV_REFERENCE.width, h: TV_REFERENCE.height } as const

export const clientMessages = defineMessages({
  'client.title': '{platform} client',
  'client.fromDisk':
    'apps/client runs only from a server: open the prototypes with bun run prototypes.',
  'client.holding': 'apps/client · dimmed states aren’t followed yet',
  'client.caption': 'apps/client · {input}',
})
export const tClient = createT(clientMessages)

const isClientPlatform = (p: string | undefined): p is ClientPlatform =>
  p === 'web' || p === 'mobile' || p === 'tv'

/**
 * The client's path in a chrome route (`/mobile/connect` → `/connect`), for any client platform,
 * with the route's query kept: `/web/settings?section=devices` opens the client's Settings at
 * Devices (apps/client/src/app/(in)/settings.tsx reads `?section=`).
 */
export function clientPathOf(path: string): string | null {
  const at = path.indexOf('?')
  const [, platform, ...rest] = (at < 0 ? path : path.slice(0, at)).split('/')
  if (!isClientPlatform(platform)) return null
  const query = at < 0 ? '' : path.slice(at + 1)
  const route = `/${rest.join('/')}`.replace(/\/+$/, '') || '/'
  const alias = CLIENT_ALIASES[route]
  if (alias) return query ? `${alias}&${query}` : alias
  return `${route}${query ? `?${query}` : ''}`
}

/**
 * Whether the client holds a chrome route: since B3 every client platform's route is the
 * client's (one-client-platform-b.md › B3), an address it doesn't know drawing its own not-found
 * page; only the admin's are the prototype's own (part D).
 */
export const heldByClient = (path: string): boolean => clientPathOf(path) !== null

/** The chrome's route for a client route the frame on `platform` reports. */
export const chromePathOf = (platform: ClientPlatform, clientPath: string) =>
  clientPath === '/' ? `/${platform}` : `/${platform}${clientPath}`

/**
 * The client's address in a frame: its route under /web, its query kept, with the input for its
 * first paint.
 */
export function clientSrc(platform: ClientPlatform, clientPath: string): string {
  const at = clientPath.indexOf('?')
  const path = at < 0 ? clientPath : clientPath.slice(0, at)
  const query = at < 0 ? '' : clientPath.slice(at + 1)
  return `/web${path === '/' ? '/' : path}?${query ? `${query}&` : ''}ff=${FRAME_INPUTS[platform]}`
}
