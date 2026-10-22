// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8c's curation through the SDK: an announcement for one role reaches only that role,
// over the API and the event stream; seen once per person; a featured section on the home screen
// by TMDB id, a rule with no matches hidden; the order; the preview saves nothing; and the admin's
// routes refused to a member (ADR 0032).
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AnnouncementInput, FeaturedSectionInput } from '@highsea/api-contract'
import type { Fetch } from '@highsea/core'
import { createReplayFetch } from '@highsea/metadata/replay'
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
  const { owner, token } = await withOwner(runtime)
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
    app,
    owner,
    api,
    adminApi: clientFor(app, { token: admin.token }),
    memberApi: clientFor(app, { token: member.token }),
    admin,
    member,
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

const now = () => new Date().toISOString()

const announcement = (patch: Partial<AnnouncementInput> = {}): AnnouncementInput => ({
  title: 'Movie night',
  body: 'Friday at 8.',
  image: null,
  cta: null,
  severity: 'notice',
  placements: ['banner'],
  audience: { kind: 'everyone' },
  schedule: { start: now(), end: null },
  acknowledgement: 'dismiss',
  draft: false,
  ...patch,
})

const section = (patch: Partial<FeaturedSectionInput> = {}): FeaturedSectionInput => ({
  title: 'Staff picks',
  tagline: 'by Ines',
  layout: 'row',
  source: { kind: 'manual', itemIds: [SINTEL, BIG_BUCK_BUNNY] },
  overrides: [],
  audience: { kind: 'everyone' },
  schedule: { start: now(), end: null },
  ...patch,
})

/** Events from someone's stream, read until `done` says stop. */
async function readStream(
  app: ReturnType<typeof createApi>,
  token: string,
  done: (text: string) => boolean,
) {
  const res = await app.request('http://localhost/api/v1/events', {
    headers: { authorization: `Bearer ${token}` },
  })
  const reader = res.body?.getReader() as ReadableStreamDefaultReader<Uint8Array>
  let text = ''
  return {
    async until() {
      while (!done(text)) {
        const { value, done: ended } = await reader.read()
        if (ended) break
        text += new TextDecoder().decode(value)
      }
      await reader.cancel()
      return text
    },
  }
}

describe('announcements', () => {
  test('one for admins reaches only admins, over the API and the event stream', async () => {
    const { app, api, adminApi, memberApi, runtime, admin, member } = await started()
    const sentinel = 'end-of-test'
    const forAdmin = await readStream(app, admin.token, (t) => t.includes(sentinel))
    const forMember = await readStream(app, member.token, (t) => t.includes(sentinel))

    const a = await api.curation.addAnnouncement({
      body: announcement({ audience: { kind: 'roles', roles: ['admin'] } }),
    })
    expect(a.status).toBe('live')
    expect((await adminApi.announcements.active({ query: {} })).map((x) => x.id)).toEqual([a.id])
    expect(await memberApi.announcements.active({ query: { client: 'tvos' } })).toEqual([])
    expect(await api.announcements.active({ query: {} })).toEqual([])

    runtime.events.emit({ topic: 'announcements.updated', ids: [sentinel] })
    const adminText = await forAdmin.until()
    const memberText = await forMember.until()
    expect(adminText).toContain('"topic":"announcements.updated"')
    expect(adminText.indexOf('announcements.updated')).toBeLessThan(adminText.indexOf(sentinel))
    // the member's first announcements event is the sentinel: theirs never came
    expect(memberText.indexOf('announcements.updated')).toBe(
      memberText.lastIndexOf('announcements.updated'),
    )
    expect(memberText).not.toContain('"to"')
  })

  test('seen once per person, counted in the admin’s reach', async () => {
    const { api, memberApi } = await started()
    const a = await api.curation.addAnnouncement({ body: announcement() })
    await memberApi.announcements.seen({ params: { id: a.id } })
    await memberApi.announcements.seen({ params: { id: a.id } })
    const [summary] = await api.curation.announcements()
    expect(summary).toMatchObject({ seenBy: 1, audienceSize: 3 })
    expect((await memberApi.announcements.active({ query: {} }))[0]?.seen).toBe(true)
    await api.curation.endAnnouncement({ params: { id: a.id } })
    expect(await memberApi.announcements.active({ query: {} })).toEqual([])
    expect((await api.curation.announcement({ params: { id: a.id } })).status).toBe('ended')
  })

  test('publishing checks what a draft may leave out', async () => {
    const { api } = await started()
    const draft = await api.curation.addAnnouncement({
      body: announcement({ draft: true, placements: [] }),
    })
    expect(draft.status).toBe('draft')
    const refused = await failure(
      api.curation.saveAnnouncement({
        params: { id: draft.id },
        body: announcement({ placements: [] }),
      }),
    )
    expect(refused).toEqual({ code: 'invalid', reason: 'required' })
  })
})

describe('featured sections and the home screen', () => {
  test('a section by TMDB id, only titles with a file; a rule with no matches is hidden', async () => {
    const { api, memberApi, runtime } = await started()
    withFile(runtime, SINTEL)
    const picks = await api.curation.addSection({ body: section() })
    expect(picks.source).toEqual({ kind: 'manual', itemIds: [SINTEL, BIG_BUCK_BUNNY] })
    const empty = await api.curation.addSection({
      body: section({
        title: 'Silent era',
        source: { kind: 'rule', rule: 'filter', value: 'year < 1930' },
      }),
    })
    const home = await memberApi.home.sections({ query: { client: 'web' } })
    const featured = home.find((s) => s.id === picks.id)
    expect(featured?.items.map((m) => m.id)).toEqual([SINTEL])
    expect(home.some((s) => s.id === empty.id)).toBe(false)
    expect(home.find((s) => s.id === 'recent')?.items.map((m) => m.id)).toEqual([SINTEL])

    const summaries = await api.curation.sections()
    expect(summaries.map((s) => [s.title, s.itemCount])).toEqual([
      ['Staff picks', 1],
      ['Silent era', 0],
    ])
    const resolved = await api.curation.resolve({
      body: { source: { kind: 'rule', rule: 'recently-added', value: '30d' } },
    })
    expect(resolved.total).toBe(1)

    await api.curation.orderSections({ body: { ids: [empty.id, picks.id] } })
    expect((await api.curation.sections()).map((s) => s.id)).toEqual([empty.id, picks.id])
    const options = await api.curation.ruleOptions()
    expect(options.genres.length).toBeGreaterThan(0)
  })

  test('the preview shows a draft and saves nothing', async () => {
    const { api, runtime, owner } = await started()
    withFile(runtime, BIG_BUCK_BUNNY)
    const preview = await api.curation.preview({
      body: {
        client: 'tvos',
        userId: owner.id,
        draft: { kind: 'section', section: section({ title: '', layout: 'hero' }) },
      },
    })
    expect(preview.sections[0]).toMatchObject({ id: 'draft', layout: 'hero' })
    expect(preview.reaches).toBe(true)
    expect(await api.curation.sections()).toEqual([])
  })

  test('the admin’s routes are staff only; the home screen is everyone’s', async () => {
    const { memberApi } = await started()
    expect((await failure(memberApi.curation.announcements())).code).toBe('forbidden')
    expect((await failure(memberApi.curation.sections())).code).toBe('forbidden')
    expect(await memberApi.home.sections({ query: {} })).toEqual([])
  })
})
