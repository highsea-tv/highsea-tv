// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8c's quality editors through the SDK: a profile added, saved with its wait, reordered
// and deleted, refused while a movie uses it or while it's the last; a preset format saved becomes
// `edited`, a new one is the owner's, and deleting one takes its scores from every profile; the
// size table saved whole and checked; a member refused.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Fetch } from '@highsea/core'
import { createReplayFetch } from '@highsea/metadata/replay'
import { defaultQualitySizes } from '@highsea/quality'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

afterEach(cleanup)

const SINTEL = 45745

async function started() {
  const runtime = await bootRuntime({ fetch: createReplayFetch() as Fetch })
  await runtime.metadata.settings.setKey('test-tmdb-key')
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Mara')
  return {
    runtime,
    api: clientFor(app, { token }),
    memberApi: clientFor(app, { token: member.token }),
  }
}

describe('quality profiles', () => {
  test('added last, saved with a wait, reordered, deleted; the seeded ones are built in', async () => {
    const { api, runtime } = await started()
    const seeded = await api.quality.profiles()
    expect(seeded.every((p) => p.builtIn && p.waitMinutes === 0)).toBe(true)
    const hd = seeded.find((p) => p.id === 'qp-hd')
    if (!hd) throw new Error('no qp-hd')

    const { id: _, builtIn: __, ...input } = hd
    const topics: string[] = []
    runtime.events.subscribe((e) => topics.push(e.topic))
    const mine = await api.quality.addProfile({
      body: { ...input, name: 'Mine', waitMinutes: 90 },
    })
    expect(mine).toMatchObject({ name: 'Mine', waitMinutes: 90, builtIn: false })
    expect(topics).toContain('settings.updated')
    expect((await api.quality.profiles()).at(-1)?.id).toBe(mine.id)

    const saved = await api.quality.saveProfile({
      params: { id: 'qp-hd' },
      body: { ...input, waitMinutes: 30 },
    })
    expect(saved).toMatchObject({ waitMinutes: 30, builtIn: true })
    expect(
      (
        await failure(
          api.quality.saveProfile({ params: { id: 'qp-hd' }, body: { ...input, name: 'mine' } }),
        )
      ).reason,
    ).toBe('name-taken')
    expect(
      (
        await failure(
          api.quality.saveProfile({
            params: { id: 'qp-hd' },
            body: { ...input, cutoff: 'Remux-2160p' },
          }),
        )
      ).reason,
    ).toBe('invalid')

    const ids = (await api.quality.profiles()).map((p) => p.id)
    await api.quality.orderProfiles({ body: { ids: [...ids].reverse() } })
    expect((await api.quality.profiles()).map((p) => p.id)).toEqual([...ids].reverse())
    expect((await failure(api.quality.orderProfiles({ body: { ids: ids.slice(1) } }))).code).toBe(
      'invalid',
    )

    await api.quality.removeProfile({ params: { id: mine.id } })
    expect((await api.quality.profiles()).some((p) => p.id === mine.id)).toBe(false)
    expect((await failure(api.quality.removeProfile({ params: { id: mine.id } }))).code).toBe(
      'not-found',
    )
  })

  test('one a movie uses can’t be deleted, nor can the last', async () => {
    const { api, runtime } = await started()
    const root = join(runtime.config.dataDir, 'movies')
    mkdirSync(root, { recursive: true })
    runtime.media.rootFolders.add(root)
    await api.movies.add({
      body: {
        tmdbId: SINTEL,
        rootFolder: root,
        monitored: true,
        minimumAvailability: 'released',
        languageProfileId: null,
        versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
      },
    })
    expect((await failure(api.quality.removeProfile({ params: { id: 'qp-hd' } }))).reason).toBe(
      'in-use',
    )
    await api.quality.removeProfile({ params: { id: 'qp-any' } })
    await api.quality.removeProfile({ params: { id: 'qp-uhd' } })
    // qp-hd is the last; Sintel aside, it's refused for that too
    await api.movies.delete({ params: { id: SINTEL }, query: {} })
    expect((await failure(api.quality.removeProfile({ params: { id: 'qp-hd' } }))).reason).toBe(
      'last-profile',
    )
  })

  test('a member can’t change them (staff only, as reading them is)', async () => {
    const { memberApi } = await started()
    expect((await failure(memberApi.quality.removeProfile({ params: { id: 'qp-hd' } }))).code).toBe(
      'forbidden',
    )
    expect(
      (await failure(memberApi.quality.orderProfiles({ body: { ids: ['qp-hd'] } }))).code,
    ).toBe('forbidden')
  })
})

describe('custom formats', () => {
  test('a preset saved is edited; a new one is the owner’s; deleting takes its scores', async () => {
    const { api } = await started()
    const x265 = (await api.quality.customFormats()).find((f) => f.id === 'cf-x265')
    expect(x265).toMatchObject({ source: 'preset', edited: false })
    if (!x265) throw new Error('no cf-x265')

    const saved = await api.quality.saveFormat({
      params: { id: 'cf-x265' },
      body: { name: x265.name, conditions: x265.conditions },
    })
    expect(saved).toMatchObject({ source: 'preset', edited: true })

    const mine = await api.quality.addFormat({
      body: {
        name: 'AV1',
        conditions: [
          { kind: 'title', name: 'AV1', value: '\\bav1\\b', negate: false, required: false },
        ],
      },
    })
    expect(mine).toMatchObject({ source: 'custom', edited: false, trashId: null })
    expect(
      (
        await failure(
          api.quality.addFormat({
            body: {
              name: 'Broken',
              conditions: [{ kind: 'title', name: '', value: '(', negate: false, required: false }],
            },
          }),
        )
      ).code,
    ).toBe('invalid')
    expect(
      (await failure(api.quality.addFormat({ body: { name: 'av1', conditions: mine.conditions } })))
        .reason,
    ).toBe('name-taken')

    // qp-hd scores x265; deleting the format takes the score with it
    expect(
      (await api.quality.profiles()).find((p) => p.id === 'qp-hd')?.formats.map((f) => f.formatId),
    ).toContain('cf-x265')
    await api.quality.removeFormat({ params: { id: 'cf-x265' } })
    expect(
      (await api.quality.profiles()).find((p) => p.id === 'qp-hd')?.formats.map((f) => f.formatId),
    ).not.toContain('cf-x265')
  })
})

describe('quality sizes', () => {
  test('saved whole, each row checked, every quality there', async () => {
    const { api } = await started()
    const rows = await api.settings.qualitySizes()
    const changed = rows.map((r) => (r.quality === 'Bluray-1080p' ? { ...r, max: 500 } : r))
    await api.settings.saveQualitySizes({ body: changed })
    expect((await api.settings.qualitySizes()).find((r) => r.quality === 'Bluray-1080p')?.max).toBe(
      500,
    )
    const backwards = rows.map((r) =>
      r.quality === 'Bluray-1080p' ? { ...r, min: 900, max: 100 } : r,
    )
    expect((await failure(api.settings.saveQualitySizes({ body: backwards }))).code).toBe('invalid')
    expect((await failure(api.settings.saveQualitySizes({ body: rows.slice(1) }))).code).toBe(
      'invalid',
    )
    await api.settings.saveQualitySizes({ body: defaultQualitySizes() })
  })
})
