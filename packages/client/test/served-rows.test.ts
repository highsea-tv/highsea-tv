// SPDX-License-Identifier: AGPL-3.0-only
// servedRows (src/data): Home's rows with only the kinds a server serves, so a server without
// shows or music draws Home as B2 did (one-client-platform-b.md › B3).
import { describe, expect, test } from 'bun:test'
import type { HomeRow } from '@highsea-tv/api-contract'
import { servedRows } from '../src/data/index.ts'

const film = { id: 'm1', type: 'movie' }
const episode = { id: 'e1', type: 'episode', show: { id: 's1', title: 'Saltmarsh' } }
const rows = [
  { id: 'hero', title: null, suffix: null, layout: 'hero', items: [episode] },
  { id: 'continue', title: null, suffix: null, layout: 'continue', items: [episode, film] },
  { id: 'next-up', title: null, suffix: null, layout: 'continue', items: [episode] },
  { id: 'new-episodes', title: 'New episodes', suffix: null, layout: 'episodes', items: [episode] },
  { id: 'recent-shows', title: 'Shows', suffix: null, layout: 'shows', items: [{ id: 's1' }] },
  { id: 'recent-music', title: 'Music', suffix: null, layout: 'music', items: [{ id: 'a1' }] },
] as unknown as HomeRow[]

const ids = (r: HomeRow[]) => r.map((x) => `${x.id}:${x.items.length}`)

describe('servedRows', () => {
  test('keeps every row when the server serves shows and music', () => {
    expect(servedRows(rows, { shows: true, music: true })).toEqual(rows)
  })

  test('without shows: no episodes, no shows’ rows, a featured section kept empty', () => {
    expect(ids(servedRows(rows, { shows: false, music: true }))).toEqual([
      'hero:0',
      'continue:1',
      'recent-music:1',
    ])
  })

  test('without music: no music rows', () => {
    expect(ids(servedRows(rows, { shows: true, music: false }))).not.toContain('recent-music:1')
  })
})
