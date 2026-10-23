// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8d's smart collections through the SDK: made, previewed, saved and removed by staff
// and refused to a member (ADR 0032); a featured section drawing on one; the apps' Library ›
// Collections and a collection's page, each with the audience applied and only titles with a
// file. The rules themselves are tested in packages/runtime and packages/curation.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SmartCollectionInput } from '@highsea-tv/api-contract'
import type { Fetch } from '@highsea-tv/core'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

afterEach(cleanup)

const SINTEL = 45745
const BIG_BUCK_BUNNY = 10378

async function started() {
  const runtime = await bootRuntime({ fetch: createReplayFetch() as Fetch })
  await runtime.metadata.settings.setKey('test-tmdb-key')
  runtime.metadata.settings.update({ region: 'US' })
  const app = createApi(runtime)
  const { token } = await withOwner(runtime)
  const owner = runtime.auth.users.list()[0] as { id: string }
  const admin = await addMember(runtime, owner.id, 'Sam', 'admin')
  const member = await addMember(runtime, owner.id, 'Ruth')
  const root = join(runtime.config.dataDir, 'movies')
  mkdirSync(root, { recursive: true })
  runtime.media.rootFolders.add(root)
  const api = clientFor(app, { token })
  for (const tmdbId of [SINTEL, BIG_BUCK_BUNNY])
    await api.movies.add({
      body: {
        tmdbId,
        rootFolder: root,
        monitored: true,
        minimumAvailability: 'released',
        languageProfileId: null,
        versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
      },
    })
  return {
    runtime,
    api,
    adminApi: clientFor(app, { token: admin.token }),
    memberApi: clientFor(app, { token: member.token }),
  }
}

/** Gives a title's version a file: what "has a file" reads until playback (Phase 4). */
function withFile(runtime: Awaited<ReturnType<typeof started>>['runtime'], tmdbId: number) {
  runtime.database.raw.run(
    `UPDATE versions SET file_id = ? WHERE item_id IN
      (SELECT id FROM media_items WHERE tmdb_id = ? AND type = 'movie')`,
    `file-${tmdbId}`,
    tmdbId,
  )
}

/** Released 2009 or later: Sintel (2010), not Big Buck Bunny (2008). */
const collection = (patch: Partial<SmartCollectionInput> = {}): SmartCollectionInput => ({
  name: 'Lately',
  summary: '',
  artwork: null,
  rules: {
    kind: 'group',
    id: 'root',
    match: 'all',
    rules: [{ kind: 'condition', id: 'r1', field: 'year', op: 'after', value: 2008 }],
  },
  include: [],
  exclude: [],
  sort: 'title',
  descending: false,
  limit: null,
  audience: { kind: 'everyone' },
  ...patch,
})

describe('the admin', () => {
  test('with no conditions, every film is in it, previewed and saved', async () => {
    const { api } = await started()
    const none = collection({ rules: { kind: 'group', id: 'root', match: 'all', rules: [] } })
    const preview = await api.collections.preview({ body: { collection: none } })
    expect(preview).toMatchObject({ matched: 2, words: null })
    const made = await api.collections.add({ body: none })
    const [summary] = await api.collections.list()
    expect(summary).toMatchObject({ id: made.id, matched: 2 })
  })

  test('made, previewed, saved and removed by staff; a member is refused', async () => {
    const { api, adminApi, memberApi } = await started()
    const preview = await adminApi.collections.preview({ body: { collection: collection() } })
    expect(preview).toMatchObject({ matched: 1, playable: 0, words: 'Released after 2008' })
    expect(preview.items.map((i) => i.id)).toEqual([SINTEL])

    const made = await adminApi.collections.add({ body: collection() })
    expect(made.id).toMatch(/^sc-/)
    const saved = await api.collections.save({
      params: { id: made.id },
      body: collection({ name: 'Picked', rules: null, include: [BIG_BUCK_BUNNY, SINTEL] }),
    })
    expect(saved.include).toEqual([BIG_BUCK_BUNNY, SINTEL])
    const [summary] = await api.collections.list()
    expect(summary).toMatchObject({ name: 'Picked', matched: 2, playable: 0, usedBy: [] })
    expect((await api.collections.get({ params: { id: made.id } })).name).toBe('Picked')

    const fields = await api.collections.fields({ query: {} })
    expect(fields.find((f) => f.field === 'watched')?.disabled).toBe('playback')
    expect(fields.find((f) => f.field === 'collection')?.options).toContainEqual({
      value: made.id,
      label: 'Picked',
    })
    const people = await api.collections.people({ query: { q: 'Colin', field: 'director' } })
    expect(people.map((p) => p.name)).toContain('Colin Levy')

    for (const call of [
      memberApi.collections.list(),
      memberApi.collections.add({ body: collection() }),
      memberApi.collections.preview({ body: { collection: collection() } }),
      memberApi.collections.fields({ query: {} }),
      memberApi.collections.people({ query: { q: 'Colin' } }),
      memberApi.collections.get({ params: { id: made.id } }),
      memberApi.collections.save({ params: { id: made.id }, body: collection() }),
      memberApi.collections.remove({ params: { id: made.id } }),
    ])
      expect((await failure(call)).code).toBe('forbidden')

    const refused = await failure(api.collections.add({ body: collection({ rules: null }) }))
    expect(refused).toEqual({ code: 'invalid', reason: 'required' })

    await api.collections.remove({ params: { id: made.id } })
    expect(await api.collections.list()).toEqual([])
    const actions = (await api.audit.list({ query: {} })).items
      .map((e) => e.action)
      .filter((a) => a.startsWith('collection.'))
    expect(actions.sort()).toEqual(['collection.added', 'collection.removed', 'collection.updated'])
  })

  test('a featured section draws on a collection, which can’t go while it does', async () => {
    const { api, memberApi, runtime } = await started()
    withFile(runtime, SINTEL)
    withFile(runtime, BIG_BUCK_BUNNY)
    const made = await api.collections.add({ body: collection() })
    expect((await api.curation.ruleOptions()).smart).toEqual([{ id: made.id, name: 'Lately' }])
    const section = await api.curation.addSection({
      body: {
        title: 'Lately',
        tagline: null,
        layout: 'row',
        source: { kind: 'rule', rule: 'collection', value: made.id },
        overrides: [],
        audience: { kind: 'everyone' },
        schedule: { start: new Date().toISOString(), end: null },
      },
    })
    const home = await memberApi.home.sections({ query: { client: 'web' } })
    expect(home.find((s) => s.id === section.id)?.items.map((m) => m.id)).toEqual([SINTEL])

    expect(await failure(api.collections.remove({ params: { id: made.id } }))).toEqual({
      code: 'conflict',
      reason: 'in-use',
    })
    // widened: the section follows
    await api.collections.save({
      params: { id: made.id },
      body: collection({ rules: null, include: [BIG_BUCK_BUNNY, SINTEL], sort: 'manual' }),
    })
    const after = await memberApi.home.sections({ query: { client: 'web' } })
    expect(after.find((s) => s.id === section.id)?.items.map((m) => m.id)).toEqual([
      BIG_BUCK_BUNNY,
      SINTEL,
    ])
    expect(
      await failure(
        api.curation.addSection({
          body: {
            title: 'Gone',
            tagline: null,
            layout: 'row',
            source: { kind: 'rule', rule: 'collection', value: 'sc-gone' },
            overrides: [],
            audience: { kind: 'everyone' },
            schedule: { start: new Date().toISOString(), end: null },
          },
        }),
      ),
    ).toMatchObject({ code: 'invalid' })
  })
})

describe('the apps', () => {
  test('Library › Collections and a page, for the audience, only what can be played', async () => {
    const { api, adminApi, memberApi, runtime } = await started()
    const everyone = await api.collections.add({ body: collection({ name: 'Everyone' }) })
    const staff = await api.collections.add({
      body: collection({ name: 'Staff', audience: { kind: 'roles', roles: ['owner', 'admin'] } }),
    })
    // nothing to play yet: not listed, and its page isn't there
    expect((await memberApi.library.collections({ query: {} })).map((c) => c.id)).toEqual([])
    expect(
      (await failure(memberApi.library.collection({ params: { id: everyone.id }, query: {} })))
        .code,
    ).toBe('not-found')

    withFile(runtime, SINTEL)
    const forMember = await memberApi.library.collections({ query: { client: 'web' } })
    expect(forMember.map((c) => c.name)).toEqual(['Everyone'])
    expect(forMember[0]).toMatchObject({
      count: 1,
      years: '2010',
      smart: { rules: true, words: 'Released after 2008' },
    })
    const forAdmin = await adminApi.library.collections({ query: {} })
    expect(forAdmin.map((c) => c.name)).toEqual(['Everyone', 'Staff'])

    const page = await memberApi.library.collection({ params: { id: everyone.id }, query: {} })
    expect(page.items.map((i) => i.id)).toEqual([SINTEL])
    expect(
      (await failure(memberApi.library.collection({ params: { id: staff.id }, query: {} }))).code,
    ).toBe('not-found')
    expect(
      (await adminApi.library.collection({ params: { id: staff.id }, query: {} })).collection.name,
    ).toBe('Staff')
  })
})
