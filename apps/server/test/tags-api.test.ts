// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8c's tags through the SDK: added, renamed and removed with their usage, a label taken
// ignoring case, unknown tag ids refused on a movie, an indexer and a connection, the library's
// filter and bulk edit, a member refused; and a root folder's default language profile.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Fetch } from '@highsea/core'
import { createReplayFetch } from '@highsea/metadata/replay'
import { createFakeNotifications } from '@highsea/notifications/fake'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

afterEach(cleanup)

const SINTEL = 45745
const BIG_BUCK_BUNNY = 10378

async function started() {
  const replay = createReplayFetch()
  const runtime = await bootRuntime({
    fetch: replay as Fetch,
    notifications: { fetch: createFakeNotifications().fetch },
  })
  await runtime.metadata.settings.setKey('test-tmdb-key')
  runtime.metadata.settings.update({ region: 'US' })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const member = await addMember(runtime, owner.id, 'Mara')
  const root = join(runtime.config.dataDir, 'movies')
  mkdirSync(root, { recursive: true })
  const folder = runtime.media.rootFolders.add(root)
  return {
    runtime,
    root,
    folder,
    api: clientFor(app, { token }),
    memberApi: clientFor(app, { token: member.token }),
  }
}

describe('tags', () => {
  test('added, renamed and removed, with what carries them', async () => {
    const { api, root } = await started()
    const kids = await api.tags.add({ body: { label: 'Kids' } })
    expect(kids.usage).toEqual({ movies: 0, indexers: 0, lists: 0, connections: 0 })
    expect((await failure(api.tags.add({ body: { label: 'kids' } }))).reason).toBe('exists')

    await api.movies.add({
      body: {
        tmdbId: SINTEL,
        rootFolder: root,
        monitored: true,
        minimumAvailability: 'released',
        languageProfileId: null,
        tags: [kids.id],
        versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
      },
    })
    const hook = await api.connections.add({
      body: {
        kind: 'webhook',
        name: 'Kids',
        enabled: true,
        events: ['movie-added'],
        settings: { url: 'https://hooks.example.org/kids' },
        tags: [kids.id],
      },
    })
    expect(hook.tags).toEqual([kids.id])
    expect((await api.tags.list())[0]?.usage).toEqual({
      movies: 1,
      indexers: 0,
      lists: 0,
      connections: 1,
    })

    expect(
      (await api.tags.rename({ params: { id: kids.id }, body: { label: 'Family' } })).label,
    ).toBe('Family')
    await api.tags.remove({ params: { id: kids.id } })
    expect(await api.tags.list()).toEqual([])
    expect((await api.movies.get({ params: { id: SINTEL } })).tags).toEqual([])
    expect((await api.connections.list()).find((c) => c.id === hook.id)?.tags).toEqual([])
  })

  test('unknown ids are refused, not dropped', async () => {
    const { api } = await started()
    expect(
      (
        await failure(
          api.connections.add({
            body: {
              kind: 'webhook',
              name: 'Hook',
              enabled: true,
              events: ['movie-added'],
              settings: { url: 'https://hooks.example.org/x' },
              tags: ['tag_gone'],
            },
          }),
        )
      ).reason,
    ).toBe('unknown-tag')
  })

  test('the library filters by tag, and bulk edit adds and removes one', async () => {
    const { api, root } = await started()
    const kids = await api.tags.add({ body: { label: 'kids' } })
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
    await api.movies.bulk({
      body: { action: 'setTags', ids: [BIG_BUCK_BUNNY], tagIds: [kids.id], mode: 'add' },
    })
    const page = await api.movies.list({ query: { tag: kids.id } })
    expect(page.items.map((m) => m.id)).toEqual([BIG_BUCK_BUNNY])
    await api.movies.bulk({
      body: { action: 'setTags', ids: [BIG_BUCK_BUNNY], tagIds: [kids.id], mode: 'remove' },
    })
    expect((await api.movies.list({ query: { tag: kids.id } })).items).toEqual([])
  })

  test('staff only', async () => {
    const { memberApi } = await started()
    expect((await failure(memberApi.tags.list())).code).toBe('forbidden')
    expect((await failure(memberApi.tags.add({ body: { label: 'x' } }))).code).toBe('forbidden')
  })
})

describe('root folders', () => {
  test('a default language profile, used when an add doesn’t choose', async () => {
    const { api, runtime, root, folder } = await started()
    const [profile] = runtime.subtitles.profiles.list()
    if (!profile) throw new Error('no seeded language profile')
    const saved = await api.rootFolders.update({
      params: { id: folder.id },
      body: { languageProfileId: profile.id },
    })
    expect(saved.languageProfileId).toBe(profile.id)
    expect((await api.rootFolders.list())[0]?.languageProfileId).toBe(profile.id)
    const movie = await api.movies.add({
      body: {
        tmdbId: SINTEL,
        rootFolder: root,
        monitored: true,
        minimumAvailability: 'released',
        versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
      },
    })
    expect(movie.languageProfileId).toBe(profile.id)
    expect(
      (
        await failure(
          api.rootFolders.update({
            params: { id: folder.id },
            body: { languageProfileId: 'gone' },
          }),
        )
      ).reason,
    ).toBe('unknown-language-profile')
  })
})
