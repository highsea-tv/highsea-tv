// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback through the SDK (checkpoint 4.3a): the defaults, saving for the owner and
// admins and nobody else, the checks on the cache's folder (a full path, writable, outside the
// library and the downloads), the folder new streams use, the status and Clear, the remote
// ceilings, and `playback.updated` held back from people who aren't staff.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type PlaybackSettings, STAFF_TOPICS } from '@highsea-tv/api-contract'
import { ceilingOf } from '@highsea-tv/runtime'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

const dirs: string[] = []
afterEach(async () => {
  await cleanup()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const folder = () => {
  const d = mkdtempSync(join(tmpdir(), 'highsea-cache-'))
  dirs.push(d)
  return d
}

async function started() {
  const runtime = await bootRuntime()
  const { owner, token } = await withOwner(runtime)
  const admin = await addMember(runtime, owner.id, 'Ana', 'admin')
  const user = await addMember(runtime, owner.id, 'Rui')
  const app = createApi(runtime)
  return {
    runtime,
    owner: clientFor(app, { token }),
    admin: clientFor(app, { token: admin.token }),
    user: clientFor(app, { token: user.token }),
  }
}

describe('Settings › Playback', () => {
  test('the defaults, saved by an admin, and not by a user', async () => {
    const { runtime, admin, user } = await started()
    const s = await admin.settings.playback()
    expect(s).toEqual({
      acceleration: 'auto',
      toneMapping: true,
      maxTranscodes: 3,
      preset: 'balanced',
      remoteMaxMbps: 8,
      cachePath: runtime.playbackSettings.get().cachePath,
      cacheLimitGb: 20,
    })
    expect(s.cachePath.endsWith('transcodes')).toBe(true)
    const next: PlaybackSettings = {
      ...s,
      maxTranscodes: 2,
      preset: 'quality',
      remoteMaxMbps: null,
    }
    expect(await admin.settings.savePlayback({ body: next })).toEqual(next)
    expect(runtime.playbackSettings.limits()).toMatchObject({ maxTranscodes: 2, preset: 'quality' })
    expect(runtime.playbackSettings.ceiling()).toBeNull()
    expect(await failure(user.settings.playback())).toMatchObject({ code: 'forbidden' })
    expect(await failure(user.settings.savePlayback({ body: next }))).toMatchObject({
      code: 'forbidden',
    })
    expect(
      await failure(admin.settings.savePlayback({ body: { ...next, maxTranscodes: 9 } })),
    ).toMatchObject({ code: 'invalid' })
  })

  test('the cache’s folder: a full path, writable, outside the library; new streams use it', async () => {
    const { runtime, owner } = await started()
    const s = await owner.settings.playback()
    expect(
      await failure(owner.settings.savePlayback({ body: { ...s, cachePath: 'cache' } })),
    ).toMatchObject({ code: 'invalid' })
    const library = folder()
    runtime.media.rootFolders.add(library)
    expect(
      await failure(
        owner.settings.savePlayback({ body: { ...s, cachePath: join(library, 'cache') } }),
      ),
    ).toMatchObject({ code: 'invalid', reason: 'shared-folder' })
    const moved = join(folder(), 'transcodes')
    await owner.settings.savePlayback({ body: { ...s, cachePath: moved } })
    await Bun.sleep(10)
    expect(runtime.playbackSettings.get().cachePath).toBe(moved)
  })

  test('the status and Clear, for staff', async () => {
    const { admin, user } = await started()
    const status = await admin.playback.status()
    expect(status).toEqual({
      paths: [],
      inUse: null,
      cache: { transcodeBytes: 0, trickplayBytes: 0, limitBytes: 20e9, over: false },
    })
    expect(await admin.playback.clearCache()).toEqual(status)
    expect(await failure(user.playback.status())).toMatchObject({ code: 'forbidden' })
    expect(await failure(user.playback.clearCache())).toMatchObject({ code: 'forbidden' })
    expect(STAFF_TOPICS).toContain('playback.updated')
  })

  test('each remote ceiling’s bitrate and picture', () => {
    expect(ceilingOf(4)).toEqual({ bitrate: 4e6, height: 720 })
    expect(ceilingOf(8)).toEqual({ bitrate: 8e6, height: 1080 })
    expect(ceilingOf(12)).toEqual({ bitrate: 12e6, height: 1080 })
    expect(ceilingOf(20)).toEqual({ bitrate: 20e6, height: 2160 })
    expect(ceilingOf(40)).toEqual({ bitrate: 40e6, height: 2160 })
    expect(ceilingOf(null)).toBeNull()
  })
})
