// SPDX-License-Identifier: AGPL-3.0-only
// The Now playing guide's screenshots (apps/docs/content/now-playing.mdx): the owner plays the
// seeded Sintel on their MacBook Pro through the API, as the web player would, so the page has a
// real session to show; it's stopped afterwards.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const SINTEL = 45745
let session: string | null = null

const main = (p: Page) => p.locator('main')

export default {
  prepare: async (c) => {
    const s = await c.api<{ id: string }>('POST', `/items/movie/${SINTEL}/play`, {
      profile: 'web-chromium',
    })
    session = s.id
    await c.api('POST', `/playback/sessions/${s.id}/progress`, { position: 252, paused: false })
  },
  finish: async (c) => {
    if (session) await c.api('DELETE', `/playback/sessions/${session}`)
    session = null
  },
  shots: [
    { name: 'now', path: '/now-playing', crop: main },
    {
      name: 'stop',
      path: '/now-playing',
      act: (p) => p.getByRole('button', { name: 'Stop', exact: true }).click(),
      crop: (p) => p.getByRole('dialog'),
    },
  ],
} satisfies Area
