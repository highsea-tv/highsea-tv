// SPDX-License-Identifier: AGPL-3.0-only
// A booted runtime in a temporary directory, with an owner and a way to sign people in.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultSecuritySettings, issueDevice, SECURITY_KEY } from '@highsea-tv/auth'
import type { Fetch } from '@highsea-tv/core'
import { schema, writeSetting } from '@highsea-tv/db'
import { createReplayFetch, type ReplayFetch } from '@highsea-tv/metadata/replay'
import { createFakeNotifications } from '@highsea-tv/notifications/fake'
import {
  type BootOptions,
  boot,
  getRuntime,
  hasRuntime,
  loadConfig,
  type Runtime,
} from '@highsea-tv/runtime'
import { ApiError, createClient } from '@highsea-tv/sdk'
import type { createApi } from '../src/api/app.ts'

export const meta = { address: '127.0.0.1', userAgent: 'bun test' }
export const OWNER = { username: 'ines', displayName: 'Ines', password: 'correct horse battery' }
export const tv = { name: 'Living room TV', client: 'tvos' as const, appVersion: '1.0.0' }

const dirs: string[] = []

export async function cleanup() {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
}

/**
 * A booted runtime whose outside requests go to TMDB's recordings (ADR 0029): no test reaches the
 * network, and one with no recording fails. Pass `fetch` to count or fail requests, `importing`
 * for the import pipeline's options, and `subtitles` for the subtitle providers' fakes. The
 * notification channels answer from `@highsea-tv/notifications/fake` unless `notifications` says.
 */
export async function bootRuntime(
  options: {
    fetch?: ReplayFetch | Fetch
    importing?: BootOptions['importing']
    subtitles?: BootOptions['subtitles']
    lists?: BootOptions['lists']
    notifications?: BootOptions['notifications']
    restart?: BootOptions['restart']
    clock?: BootOptions['clock']
  } = {},
): Promise<Runtime> {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-api-'))
  dirs.push(dir)
  return boot({
    fetch: options.fetch ?? createReplayFetch(),
    config: loadConfig({
      HIGHSEA_CONFIG_DIR: join(dir, 'config'),
      HIGHSEA_DATA_DIR: join(dir, 'data'),
    }),
    version: '0.1.0',
    quiet: true,
    memory: true,
    manualTicks: true,
    indexerTimeoutMs: 2000,
    // no torrent opens a socket: grabs are added, nothing downloads
    torrent: { offline: true },
    importing: options.importing,
    subtitles: options.subtitles,
    lists: options.lists,
    notifications: options.notifications ?? { fetch: createFakeNotifications().fetch },
    // a restore's restart never ends the test process
    restart: options.restart ?? (() => {}),
    clock: options.clock,
  })
}

/** An app's device token for someone, as pairing or an app sign-in would issue it. */
export const tokenFor = (runtime: Runtime, userId: string) =>
  issueDevice(runtime.auth.ctx, userId, 'password', meta, tv).secret

export async function withOwner(runtime: Runtime) {
  const owner = await runtime.auth.createOwner(OWNER, meta)
  // a new server requires two-step for staff (ADR 0032); these tests sign in without it unless one
  // turns it on
  writeSetting(
    runtime.db,
    SECURITY_KEY,
    { ...defaultSecuritySettings, twoFactor: false },
    Date.now(),
  )
  return { owner, token: tokenFor(runtime, owner.id) }
}

/** Someone invited with `role` who has accepted; returns their id and a device token. */
export async function addMember(
  runtime: Runtime,
  ownerId: string,
  displayName: string,
  role: 'admin' | 'user' = 'user',
) {
  const invite = runtime.auth.users.invite(
    { displayName, email: null, role, libraries: 'all' },
    { id: ownerId, name: OWNER.username },
    meta,
  )
  const token = invite.link.split('/').pop() as string
  const accepted = await runtime.auth.links.accept(
    token,
    { password: 'a long enough password' },
    meta,
  )
  return { id: invite.user.id, token: tokenFor(runtime, accepted.session.user.id) }
}

export const ORIGIN = 'http://localhost'

/** An SDK client over the app in memory, as a browser on this origin or as an app with a token. */
export function clientFor(
  app: ReturnType<typeof createApi>,
  auth: { token?: string; cookie?: string } = {},
) {
  return createClient({
    token: auth.token,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      if (auth.cookie) {
        headers.set('cookie', auth.cookie)
        headers.set('sec-fetch-site', 'same-origin')
      }
      return app.request(`${ORIGIN}${input}`, { ...init, headers })
    },
  })
}

/** The error an SDK call fails with. */
export async function failure(call: Promise<unknown>) {
  try {
    await call
  } catch (e) {
    if (e instanceof ApiError)
      return { code: e.code, reason: (e.details as { reason?: string })?.reason }
    throw e
  }
  throw new Error('expected the call to fail')
}

export const SIZE = 4096
/** A test film's bytes: each one its offset modulo 256, so a range can be checked byte for byte. */
export const BYTES = Buffer.from(Array.from({ length: SIZE }, (_, i) => i % 256))

/** A film in Blender's collection with one H.264 and AAC MP4, 100 seconds long. */
export function film(
  runtime: Runtime,
  dir: string,
  tmdbId: number,
  title: string,
  year: number,
  subtitles: unknown[] = [],
) {
  const now = Date.now()
  const path = join(dir, `${title}.mp4`)
  writeFileSync(path, BYTES)
  const { db } = runtime
  db.insert(schema.movieMetadata)
    .values({
      tmdbId,
      title,
      originalTitle: title,
      year,
      releaseDate: `${year}-09-27`,
      collectionId: 9,
      language: 'en',
      data: {},
      fetchedAt: now,
    })
    .run()
  const item = `itm_${tmdbId}`
  db.insert(schema.mediaItems)
    .values({
      id: item,
      type: 'movie',
      tmdbId,
      title,
      sortTitle: title.toLowerCase(),
      year,
      releaseDate: `${year}-09-27`,
      status: 'available',
      monitored: true,
      minimumAvailability: 'released',
      qualityProfileId: 'qp-hd',
      rootFolder: dir,
      path: dir,
      addedAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.mediaFiles)
    .values({
      id: `fil_${tmdbId}`,
      itemId: item,
      path,
      size: SIZE,
      sceneName: null,
      mediaInfo: {
        probe: {
          duration: 100,
          container: 'mov,mp4,m4a,3gp,3g2,mj2',
          video: {
            index: 0,
            codec: 'h264',
            codecTag: 'avc1',
            profile: 'High',
            width: 1920,
            height: 1080,
            bitDepth: 8,
            bitrate: 4_000_000,
            colorPrimaries: 'bt709',
            colorTransfer: 'bt709',
            hdr: 'sdr',
            dolbyVision: null,
          },
          audio: [
            {
              index: 1,
              codec: 'aac',
              codecTag: 'mp4a',
              profile: 'LC',
              channels: 2,
              layout: 'stereo',
              language: 'eng',
              title: null,
              default: true,
              bitrate: 128_000,
            },
          ],
          subtitles,
        },
      },
      addedAt: now,
    } as typeof schema.mediaFiles.$inferInsert)
    .run()
  db.insert(schema.versions)
    .values({
      id: `ver_${tmdbId}`,
      itemId: item,
      label: 'Default',
      qualityProfileId: 'qp-hd',
      fileId: `fil_${tmdbId}`,
      position: 0,
      createdAt: now,
    } as typeof schema.versions.$inferInsert)
    .run()
}
