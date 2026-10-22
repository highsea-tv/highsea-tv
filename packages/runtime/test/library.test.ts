// SPDX-License-Identifier: AGPL-3.0-only
// The runtime's 6b library wiring: watching the root folders (and falling back to the scan, with
// a health note, when a watch can't run), the 12-hourly scan's schedule, and unar missing as a
// health note.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import type { WatchFn } from '@highsea-tv/media/shared'
import { boot, getRuntime, hasRuntime, loadConfig } from '../src/index.ts'

const torrent = { offline: true }
const dirs: string[] = []
const savedUnar = process.env.HIGHSEA_UNAR
const savedFfmpeg = process.env.HIGHSEA_FFMPEG
afterEach(async () => {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  if (savedUnar === undefined) delete process.env.HIGHSEA_UNAR
  else process.env.HIGHSEA_UNAR = savedUnar
  if (savedFfmpeg === undefined) delete process.env.HIGHSEA_FFMPEG
  else process.env.HIGHSEA_FFMPEG = savedFfmpeg
})

async function start(watch?: WatchFn) {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-rt-library-'))
  dirs.push(dir)
  const config = loadConfig({
    HIGHSEA_CONFIG_DIR: join(dir, 'config'),
    HIGHSEA_DATA_DIR: join(dir, 'data'),
  })
  const rt = await boot({
    config,
    version: '0.1.0',
    quiet: true,
    manualTicks: true,
    torrent,
    watch,
  })
  const root = join(dir, 'data', 'media', 'movies')
  mkdirSync(root, { recursive: true })
  return { rt, root }
}

const until = async (check: () => boolean, what: string) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > 5_000) throw new Error(`Timed out waiting for ${what}.`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('the library at runtime', () => {
  test('a root folder added is watched; one that can’t be is a notice, never an error', async () => {
    const watched: string[] = []
    const watch: WatchFn = (path) => {
      if (path.endsWith('nas')) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })
      watched.push(path)
      return { close() {}, on: (() => undefined) as never }
    }
    const { rt, root } = await start(watch)
    rt.media.rootFolders.add(root)
    // the root folder routes announce settings.updated
    rt.events.emit({ topic: 'settings.updated' })
    expect(rt.libraryWatch.watching()).toEqual([root])
    expect(watched).toEqual([root])

    const nas = join(root, '..', 'nas')
    mkdirSync(nas)
    rt.media.rootFolders.add(nas)
    expect(() => rt.libraryWatch.sync()).not.toThrow()
    const issue = rt.issues().find((i) => i.id === `watch:${nas}`)
    expect(issue).toMatchObject({ source: 'Library', level: 'notice' })
    expect(issue?.message).toContain('the system’s limit on watched folders is reached')
    expect(issue?.message).toContain('every 12 hours')
  })

  test('the library scan is scheduled at boot, for System › Tasks', async () => {
    const { rt } = await start(() => ({ close() {}, on: (() => undefined) as never }))
    const row = rt.db
      .select()
      .from(schema.jobSchedules)
      .all()
      .find((s) => s.type === 'library.scan')
    expect(row).toMatchObject({ everyMs: 12 * 60 * 60 * 1000, enabled: true })
  })

  test('unar missing is a warning on System › Health', async () => {
    process.env.HIGHSEA_UNAR = join(tmpdir(), 'highsea-no-such-unar')
    const { rt } = await start(() => ({ close() {}, on: (() => undefined) as never }))
    await until(() => rt.issues().some((i) => i.id === 'unar-missing'), 'the unar check')
    expect(rt.issues().find((i) => i.id === 'unar-missing')).toMatchObject({
      source: 'Import',
      level: 'warning',
    })
  })

  test('ffmpeg missing is a warning on System › Health, under Subtitles', async () => {
    process.env.HIGHSEA_FFMPEG = join(tmpdir(), 'highsea-no-such-ffmpeg')
    const { rt } = await start(() => ({ close() {}, on: (() => undefined) as never }))
    await until(() => rt.issues().some((i) => i.id === 'ffmpeg-missing'), 'the ffmpeg check')
    expect(rt.issues().find((i) => i.id === 'ffmpeg-missing')).toMatchObject({
      source: 'Subtitles',
      level: 'warning',
    })
  })
})
