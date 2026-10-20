// SPDX-License-Identifier: AGPL-3.0-only
import { createEventBus, createFakeClock, type ServerEvent } from '@highsea/core'
import { migrate, openDatabase, schema } from '@highsea/db'
import type { ClientType } from '@highsea/db/schema'
import { createPersonalization } from '../src/index.ts'

export function setup() {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  let name = 'Harbor'
  const p = createPersonalization({
    db,
    clock,
    events,
    serverName: () => name,
    rename: (next) => {
      name = next
    },
  })
  const now = clock.now()
  const person = (id: string, role: 'owner' | 'admin' = 'admin') => {
    db.insert(schema.users)
      .values({
        id,
        username: id,
        displayName: id,
        role,
        webauthnId: `w-${id}`,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    return { id, role }
  }
  const device = (id: string, userId: string, client: ClientType) => {
    db.insert(schema.devices)
      .values({
        id,
        userId,
        kind: 'token',
        tokenHash: `h-${id}`,
        name: id,
        client,
        appVersion: '1.0.0',
        address: '192.168.1.20',
        method: 'pairing',
        createdAt: now,
        lastSeenAt: now,
      })
      .run()
    return id
  }
  return { db, clock, events, seen, p, person, device, name: () => name }
}

/** A PNG's signature and IHDR chunk: all the mark check reads. */
export function png(width: number, height: number) {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
  bytes.set(
    [...'IHDR'].map((c) => c.charCodeAt(0)),
    12,
  )
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

export const svg = (body: string) => new TextEncoder().encode(body)
