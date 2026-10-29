// SPDX-License-Identifier: AGPL-3.0-only
// Now playing over the API (checkpoint 4.3a): the live sessions with how each is sent, staff only;
// Stop with a message reaching the person (their `playback.stopped`, then a 404 saying who and why);
// the row lingering as stopped; and the 30 days of history: one row per evening's film, no
// addresses, and the daily prune.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SESSIONS_TOPICS, type ServerEvent } from '@highsea-tv/api-contract'
import { createFakeClock } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { HISTORY_PRUNE_JOB, KEEP_HISTORY_MS, STOPPED_LINGER_MS } from '@highsea-tv/runtime'
import { ApiError } from '@highsea-tv/sdk'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, film, withOwner } from './helpers.ts'

const SINTEL = 45745
const item = { type: 'movie' as const, id: SINTEL }

const dirs: string[] = []
afterEach(async () => {
  await cleanup()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function serve() {
  const clock = createFakeClock(Date.now())
  const runtime = await bootRuntime({ clock })
  const { owner, token } = await withOwner(runtime)
  const sam = await addMember(runtime, owner.id, 'Sam')
  const dir = mkdtempSync(join(tmpdir(), 'highsea-sessions-'))
  dirs.push(dir)
  film(runtime, dir, SINTEL, 'Sintel', 2010)
  const app = createApi(runtime)
  return {
    runtime,
    clock,
    sam,
    staff: clientFor(app, { token }),
    member: clientFor(app, { token: sam.token }),
  }
}

async function failure(call: Promise<unknown>) {
  try {
    await call
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('expected the call to fail')
}

describe('now playing', () => {
  test('lists who is watching what, how it’s sent, and the totals; staff only', async () => {
    const { staff, member } = await serve()
    expect((await staff.sessions.list()).sessions).toEqual([])
    const s = await member.playback.play({ params: item, body: { profile: 'web-chromium' } })
    const np = await staff.sessions.list()
    expect(np.sessions).toHaveLength(1)
    expect(np.sessions[0]).toMatchObject({
      id: s.id,
      user: { displayName: 'Sam' },
      deviceName: 'Living room TV',
      client: 'tvos',
      item: { tmdbId: SINTEL, title: 'Sintel', year: 2010 },
      version: '1080p · H.264 · 0.0 GB',
      kind: 'stream',
      state: 'playing',
      method: 'direct-play',
      reasons: [],
      sent: '1080p · H.264 · AAC stereo',
      hardware: null,
      speed: null,
      stopped: null,
    })
    expect(np.transcodes).toBe(0)
    // a member can't see anyone's sessions, not even their own here
    expect((await failure(member.sessions.list())).code).toBe('forbidden')
    expect((await failure(member.sessions.history({ query: {} }))).code).toBe('forbidden')
  })

  test('a pause announces at once, and reports moving on at most every few seconds', async () => {
    const { runtime, clock, staff, member } = await serve()
    const s = await member.playback.play({ params: item, body: {} })
    const heard: ServerEvent[] = []
    const off = runtime.events.subscribe((e) => {
      if (e.topic === SESSIONS_TOPICS.updated) heard.push(e)
    })
    clock.advance(1_000)
    await member.playback.progress({ params: { id: s.id }, body: { position: 1, paused: true } })
    expect(heard).toHaveLength(1)
    expect((await staff.sessions.list()).sessions[0]?.state).toBe('paused')
    clock.advance(10_000)
    await member.playback.progress({ params: { id: s.id }, body: { position: 1, paused: false } })
    expect(heard).toHaveLength(2)
    off()
  })

  test('Stop ends the stream, tells the person, and the row says so for a moment', async () => {
    const { runtime, clock, sam, staff, member } = await serve()
    const s = await member.playback.play({ params: item, body: {} })
    const told: (ServerEvent & { to?: string[] })[] = []
    const off = runtime.events.subscribe((e) => {
      if (e.topic === SESSIONS_TOPICS.stopped) told.push(e)
    })
    clock.advance(30_000)
    await member.playback.progress({ params: { id: s.id }, body: { position: 30, paused: false } })
    const after = await staff.sessions.stop({
      params: { id: s.id },
      body: { message: 'The server is restarting in five minutes.' },
    })
    off()
    expect(told).toEqual([expect.objectContaining({ ids: [s.id], to: [sam.id] })])
    expect(after.sessions[0]?.stopped).toMatchObject({
      by: 'Ines',
      message: 'The server is restarting in five minutes.',
    })
    // the stopped row isn't counted as sending
    expect(after.totalMbps).toBe(0)
    // the player's next report learns who and why
    const gone = await failure(
      member.playback.progress({ params: { id: s.id }, body: { position: 31, paused: false } }),
    )
    expect(gone.code).toBe('not-found')
    expect(gone.details).toEqual({
      reason: 'stopped',
      by: 'Ines',
      message: 'The server is restarting in five minutes.',
    })
    // stopping it again: it's gone
    expect((await failure(staff.sessions.stop({ params: { id: s.id }, body: {} }))).code).toBe(
      'not-found',
    )
    clock.advance(STOPPED_LINGER_MS)
    expect((await staff.sessions.list()).sessions).toEqual([])
  })
})

describe('Playback started', () => {
  test('heard by the connections that chose it, once a watch, not on a restart', async () => {
    const { runtime, clock, staff, member } = await serve()
    const hook = await staff.connections.add({
      body: {
        kind: 'webhook',
        name: 'Hook',
        enabled: true,
        events: ['playback-started'],
        settings: { url: 'https://hooks.example.org/x' },
        tags: [],
      },
    })
    // off by default: a connection with the usual events doesn't hear it
    const quiet = await staff.connections.add({
      body: {
        kind: 'webhook',
        name: 'Quiet',
        enabled: true,
        events: ['imported', 'health'],
        settings: { url: 'https://hooks.example.org/y' },
        tags: [],
      },
    })
    const sent = (connectionId: string) =>
      runtime.notifications.log({ connectionId }).map((e) => e.event)

    const a = await member.playback.play({ params: item, body: {} })
    clock.advance(40_000)
    await member.playback.progress({ params: { id: a.id }, body: { position: 40, paused: false } })
    await member.playback.stop({ params: { id: a.id } })
    // another sound track a moment later: the same watch
    clock.advance(5_000)
    await member.playback.play({ params: item, body: { start: 40 } })
    expect(sent(hook.id)).toEqual(['playback-started'])
    expect(sent(quiet.id)).toEqual([])
  })
})

describe('the last 30 days', () => {
  test('a row per film watched, joined across a restart, with no address', async () => {
    const { runtime, clock, staff, member } = await serve()
    // opened and closed at once: nothing watched, no row
    const first = await member.playback.play({ params: item, body: {} })
    await member.playback.stop({ params: { id: first.id } })
    expect(await staff.sessions.history({ query: {} })).toEqual([])

    const a = await member.playback.play({ params: item, body: {} })
    clock.advance(40_000)
    await member.playback.progress({ params: { id: a.id }, body: { position: 40, paused: false } })
    await member.playback.stop({ params: { id: a.id } })
    // started again a moment later on the same device, for another sound track
    clock.advance(5_000)
    const b = await member.playback.play({ params: item, body: { start: 40 } })
    clock.advance(20_000)
    await member.playback.progress({ params: { id: b.id }, body: { position: 60, paused: false } })
    await member.playback.stop({ params: { id: b.id } })

    const rows = await staff.sessions.history({ query: {} })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      user: { displayName: 'Sam' },
      deviceName: 'Living room TV',
      item: { tmdbId: SINTEL, title: 'Sintel' },
      method: 'direct-play',
      watched: 60,
      finished: false,
    })
    expect(Object.keys(rows[0] ?? {})).not.toContain('address')
    const stored = runtime.db.select().from(schema.playbackHistory).all()
    expect(Object.keys(stored[0] ?? {})).not.toContain('address')
    expect(await staff.sessions.history({ query: { userId: 'someone-else' } })).toEqual([])

    // after 30 days the daily prune removes it
    clock.advance(KEEP_HISTORY_MS + 1)
    runtime.jobs.enqueue(HISTORY_PRUNE_JOB, {})
    await runtime.jobs.tick()
    expect(runtime.db.select().from(schema.playbackHistory).all()).toEqual([])
  })
})
