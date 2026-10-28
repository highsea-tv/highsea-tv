// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import type { PlaybackDecision } from '../src/decision/index.ts'
import {
  createSessions,
  IDLE_MS,
  type PlaySession,
  SAVE_EVERY_MS,
  type SessionInput,
  TOKEN_MS,
} from '../src/sessions/index.ts'

const decision: PlaybackDecision = {
  method: 'direct-play',
  container: 'mp4',
  video: { action: 'copy' },
  audio: { index: 1, action: 'copy' },
  subtitle: null,
  bitrate: 6_000_000,
  reasons: [],
}

const input = (o: Partial<SessionInput> = {}): SessionInput => ({
  userId: 'u1',
  deviceId: 'd1',
  itemId: 'i1',
  tmdbId: 603,
  title: 'The Matrix',
  versionId: 'v1',
  file: { id: 'f1', path: '/m/a.mp4', size: 100 },
  decision,
  position: 0,
  duration: 8160,
  ...o,
})

function setup() {
  let t = 1_000_000
  const ended: [string, string][] = []
  const sessions = createSessions({
    now: () => t,
    onEnd: (s: PlaySession, why) => ended.push([s.id, why]),
  })
  return { sessions, ended, tick: (ms: number) => (t += ms) }
}

describe('tokens', () => {
  test('name their session and file, and nothing else passes', () => {
    const { sessions } = setup()
    const s = sessions.start(input())
    const token = sessions.token(s)
    expect(sessions.verify(token)?.id).toBe(s.id)
    const [id, file, sig] = token.split('.') as [string, string, string]
    // another file, a changed signature, extra parts, rubbish
    expect(sessions.verify(`${id}.f2.${sig}`)).toBeNull()
    expect(sessions.verify(`${id}.${file}.${sig.slice(1)}A`)).toBeNull()
    expect(sessions.verify(`${token}.x`)).toBeNull()
    expect(sessions.verify('nonsense')).toBeNull()
    // another session's signature
    const other = sessions.start(input({ file: { id: 'f1', path: '/m/a.mp4', size: 100 } }))
    expect(sessions.verify(`${other.id}.${file}.${sig}`)).toBeNull()
  })

  test('another server’s token fails: the key is made per process', () => {
    const a = setup().sessions
    const b = setup().sessions
    const s = a.start(input())
    expect(b.verify(a.token(s))).toBeNull()
  })

  test('last 6 hours from the last report, and end with their session', () => {
    const { sessions, tick } = setup()
    const s = sessions.start(input())
    const token = sessions.token(s)
    // a report every few minutes keeps it going past 6 hours
    for (let i = 0; i < 100; i++) {
      tick(4 * 60_000)
      sessions.heard(s, { position: i * 240, paused: false })
    }
    expect(sessions.verify(token)).not.toBeNull()
    sessions.end(s.id)
    expect(sessions.verify(token)).toBeNull()
  })

  test('fail once 6 hours pass without a report, even with a lax idle limit', () => {
    let t = 0
    const sessions = createSessions({ now: () => t, idleMs: TOKEN_MS * 2 })
    const s = sessions.start(input())
    const token = sessions.token(s)
    t += TOKEN_MS - 1
    expect(sessions.verify(token)).not.toBeNull()
    t += 1
    expect(sessions.verify(token)).toBeNull()
  })
})

describe('sessions', () => {
  test('end by themselves when nobody reports for a while', () => {
    const { sessions, ended, tick } = setup()
    const s = sessions.start(input())
    tick(IDLE_MS - 1)
    expect(sessions.list()).toHaveLength(1)
    tick(1)
    expect(sessions.list()).toHaveLength(0)
    expect(ended).toEqual([[s.id, 'idle']])
  })

  test('are each person’s own', () => {
    const { sessions } = setup()
    const s = sessions.start(input())
    expect(sessions.get(s.id, 'u1')).not.toBeNull()
    expect(sessions.get(s.id, 'u2')).toBeNull()
  })

  test('save the position on the first report, a pause, and every few seconds', () => {
    const { sessions, tick } = setup()
    const s = sessions.start(input())
    expect(sessions.heard(s, { position: 1, paused: false }).save).toBe(true)
    tick(1_000)
    expect(sessions.heard(s, { position: 2, paused: false }).save).toBe(false)
    tick(1_000)
    expect(sessions.heard(s, { position: 3, paused: true }).save).toBe(true)
    tick(SAVE_EVERY_MS)
    expect(sessions.heard(s, { position: 3, paused: true }).save).toBe(true)
    expect(s.position).toBe(3)
  })

  test('are taken away together', () => {
    const { sessions, ended } = setup()
    const a = sessions.start(input())
    const b = sessions.start(input({ deviceId: 'd2' }))
    sessions.start(input({ userId: 'u2' }))
    sessions.revoke('u1', (s) => s.deviceId === 'd2')
    expect(ended).toEqual([[a.id, 'revoked']])
    expect(sessions.list().map((s) => s.id)).toContain(b.id)
    expect(sessions.list()).toHaveLength(2)
  })
})
