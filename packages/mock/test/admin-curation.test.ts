// SPDX-License-Identifier: AGPL-3.0-only
// The admin's curation routes through the transport (one-client-platform-d.md › D2): the lists
// in the contract's shapes, writes showing on the next read, the composer and the preview, and
// the server's refusals.
import { describe, expect, test } from 'bun:test'
import { type AnnouncementInput, type FeaturedSectionInput, routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'
import { curationMessages } from '../src/admin/curation.ts'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ines’s Mac', client: 'web' as const, appVersion: '0.4.0' }

/** Signed in as the username typed; Ines, the owner, takes a second step. */
const setup = async (as = 'ines') => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  const anon = createClient({ baseUrl: LAN, fetch })
  let r = await anon.auth.signIn({ body: { username: as, password: 'x', device } })
  if (r.status === 'two-factor')
    r = await anon.auth.twoFactor({ body: { challenge: r.challenge, code: '123456' } })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  return createClient({ baseUrl: LAN, fetch, token: r.token })
}

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('it answered')
}

type Schema = { parse(value: unknown): unknown }
const parse = (route: { responses: Record<number, unknown> }, value: unknown, status = 200) =>
  (route.responses as Record<number, { content: { 'application/json': { schema: Schema } } }>)[
    status
  ]?.content['application/json'].schema.parse(value)

const day = 86_400_000
const announcement = (over: Partial<AnnouncementInput> = {}): AnnouncementInput => ({
  title: 'Maintenance on Sunday',
  body: 'Harbor restarts at **2 am**.',
  image: null,
  cta: null,
  severity: 'notice',
  placements: ['banner'],
  audience: { kind: 'everyone' },
  schedule: { start: new Date(Date.now() - day).toISOString(), end: null },
  acknowledgement: 'dismiss',
  draft: false,
  ...over,
})

describe('announcements', () => {
  test('the list, one, and a new one showing on the next read', async () => {
    const c = await setup()
    const list = await c.curation.announcements()
    parse(routes.curation.announcements, list)
    expect(list.length).toBeGreaterThan(0)
    const first = list[0]
    if (!first) throw new Error('none')
    parse(routes.curation.announcement, await c.curation.announcement({ params: { id: first.id } }))

    const added = await c.curation.addAnnouncement({ body: announcement() })
    parse(routes.curation.addAnnouncement, added, 201)
    expect(added.status).toBe('live')
    expect(Math.abs(Date.parse(added.schedule.start) - (Date.now() - day))).toBeLessThan(5_000)
    expect((await c.curation.announcements()).some((a) => a.id === added.id)).toBe(true)

    const saved = await c.curation.saveAnnouncement({
      params: { id: added.id },
      body: announcement({ title: 'Maintenance on Monday', acknowledgement: 'require' }),
    })
    expect(saved.title).toBe('Maintenance on Monday')
    expect(saved.placements).toEqual(['banner', 'modal'])

    await c.curation.endAnnouncement({ params: { id: added.id } })
    expect((await c.curation.announcement({ params: { id: added.id } })).status).toBe('ended')
    await c.curation.removeAnnouncement({ params: { id: added.id } })
    expect((await caught(c.curation.announcement({ params: { id: added.id } }))).status).toBe(404)
  })

  test('a draft keeps what it has; a published one is checked', async () => {
    const c = await setup()
    const draft = await c.curation.addAnnouncement({
      body: announcement({ placements: [], draft: true }),
    })
    expect(draft.status).toBe('draft')
    const e = await caught(c.curation.addAnnouncement({ body: announcement({ placements: [] }) }))
    expect(e.status).toBe(400)
    expect(e.message).toBe(curationMessages['curation.placements'])
  })
})

describe('sections', () => {
  test('the list with what each picks, a new one, its order and its removal', async () => {
    const c = await setup()
    const list = await c.curation.sections()
    parse(routes.curation.sections, list)
    const hero = list.find((s) => s.id === 'fs-hero')
    expect(hero?.source.kind).toBe('manual')
    expect(hero?.itemCount).toBeGreaterThan(0)
    expect(hero?.sample[0]?.id).toBeNumber()

    const options = await c.curation.ruleOptions()
    parse(routes.curation.ruleOptions, options)
    const genre = options.genres[0]
    if (!genre) throw new Error('no genres')
    const resolved = await c.curation.resolve({
      body: { source: { kind: 'rule', rule: 'genre', value: genre } },
    })
    parse(routes.curation.resolve, resolved)
    expect(resolved.total).toBeGreaterThan(0)

    const input: FeaturedSectionInput = {
      title: `More ${genre}`,
      tagline: null,
      layout: 'row',
      source: { kind: 'manual', itemIds: resolved.items.slice(0, 2).map((m) => m.id) },
      overrides: [],
      audience: { kind: 'everyone' },
      schedule: { start: new Date(Date.now() - day).toISOString(), end: null },
    }
    const added = await c.curation.addSection({ body: input })
    parse(routes.curation.addSection, added, 201)
    expect(added.source).toEqual(input.source)
    const saved = await c.curation.saveSection({
      params: { id: added.id },
      body: { ...input, title: 'Renamed' },
    })
    expect(saved.title).toBe('Renamed')
    expect((await c.curation.section({ params: { id: added.id } })).title).toBe('Renamed')

    await c.curation.orderSections({ body: { ids: [added.id] } })
    expect((await c.curation.sections())[0]?.id).toBe(added.id)
    await c.curation.removeSection({ params: { id: added.id } })
    expect((await caught(c.curation.section({ params: { id: added.id } }))).status).toBe(404)
  })

  test('the composer’s refusals are the server’s', async () => {
    const c = await setup()
    const e = await caught(
      c.curation.resolve({
        body: { source: { kind: 'rule', rule: 'recently-added', value: '5d' } },
      }),
    )
    expect(e.status).toBe(400)
    expect(e.message).toBe(curationMessages['curation.rule.recently-added'])
    const unknown = await caught(
      c.curation.addSection({
        body: {
          title: 'Nothing here',
          tagline: null,
          layout: 'row',
          source: { kind: 'manual', itemIds: [999_999_999] },
          overrides: [],
          audience: { kind: 'everyone' },
          schedule: { start: new Date().toISOString(), end: null },
        },
      }),
    )
    expect(unknown.message).toBe(curationMessages['curation.titleNotHere'])
  })
})

describe('the preview', () => {
  test('a draft announcement alone, and a draft section on Home', async () => {
    const c = await setup()
    const a = await c.curation.preview({
      body: {
        client: 'web',
        userId: 'u-ruth',
        draft: { kind: 'announcement', announcement: announcement({ title: 'Hello' }) },
      },
    })
    parse(routes.curation.preview, a)
    expect(a.reaches).toBe(true)
    expect(a.announcements.map((x) => x.title)).toEqual(['Hello'])

    const s = await c.curation.preview({
      body: {
        client: 'web',
        userId: 'u-ruth',
        draft: {
          kind: 'section',
          section: {
            title: 'Draft row',
            tagline: null,
            layout: 'row',
            source: { kind: 'rule', rule: 'recently-added', value: '90d' },
            overrides: [],
            audience: { kind: 'roles', roles: ['admin'] },
            schedule: { start: new Date(Date.now() + day).toISOString(), end: null },
          },
        },
      },
    })
    expect(s.reaches).toBe(false)
    expect(s.announcements).toEqual([])
    const nobody = await caught(
      c.curation.preview({
        body: {
          client: 'web',
          userId: 'u-nobody',
          draft: { kind: 'announcement', announcement: announcement() },
        },
      }),
    )
    expect(nobody.status).toBe(404)
    expect(nobody.message).toBe(curationMessages['curation.personUnknown'])
  })
})

describe('access', () => {
  test('a user is refused, as the server refuses them', async () => {
    const c = await setup('ruth')
    expect((await caught(c.curation.announcements())).status).toBe(403)
    expect((await caught(c.curation.sections())).status).toBe(403)
  })
})
