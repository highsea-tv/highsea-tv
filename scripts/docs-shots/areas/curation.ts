// SPDX-License-Identifier: AGPL-3.0-only
// The Curation guide's screenshots (apps/docs/content/curation/). The seed's announcement is gone
// before shots, so prepare writes three: one live that must be acknowledged, for Users only (so it
// doesn't banner the admin), one scheduled and one draft; and a hero with a tagline, beside the
// seed's two rows.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const ids = { live: '', hero: '' }
const day = 86_400_000
const at = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * day)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const announcement = {
  image: null,
  cta: null,
  severity: 'notice',
  placements: ['banner'],
  audience: { kind: 'everyone' },
  acknowledgement: 'dismiss',
  draft: false,
}
const previewOn = (platform: string) => (p: Page) =>
  p.getByLabel('Preview on').getByText(platform, { exact: true }).click()
const preview = (p: Page) => p.getByRole('region', { name: 'Client preview' })

export default {
  async prepare(c) {
    const live = await c.api<{ id: string }>('POST', '/curation/announcements', {
      ...announcement,
      title: 'highsea restarts tonight at 2 am',
      body: 'It’s back in about **ten minutes**. Anything you’re watching picks up where you left off.',
      severity: 'warning',
      placements: ['banner', 'card'],
      audience: { kind: 'roles', roles: ['user'] },
      acknowledgement: 'require',
      schedule: { start: new Date(Date.now() - 3_600_000).toISOString(), end: at(1, 6) },
    })
    ids.live = live.id
    await c.api('POST', '/curation/announcements', {
      ...announcement,
      title: 'Movie night is Friday',
      body: 'We’re watching **Sintel** in the living room at 8 pm.',
      placements: ['banner', 'card'],
      schedule: { start: at(3, 9), end: at(4, 23) },
    })
    await c.api('POST', '/curation/announcements', {
      ...announcement,
      title: 'A new address for highsea',
      body: '',
      severity: 'info',
      // a later start: a draft whose start has passed reaches the admin's banner (see the report)
      schedule: { start: at(14, 9), end: null },
      draft: true,
    })
    const hero = await c.api<{ id: string }>('POST', '/curation/sections', {
      title: 'Tonight',
      tagline: null,
      layout: 'hero',
      source: { kind: 'manual', itemIds: [45745, 10378] },
      overrides: [
        { itemId: 45745, artwork: null, tagline: 'A girl, a dragon and a long way home.' },
      ],
      audience: { kind: 'everyone' },
      schedule: { start: new Date().toISOString(), end: null },
    })
    ids.hero = hero.id
  },
  shots: [
    { name: 'announcements', path: '/curation' },
    { name: 'featured', path: '/curation/featured' },
    { name: 'announcement-edit', path: () => `/curation/announcements/${ids.live}`, height: 1500 },
    {
      name: 'announcement-menu',
      path: '/curation',
      act: (p) =>
        p.getByRole('button', { name: 'More for highsea restarts tonight at 2 am' }).click(),
    },
    { name: 'section-hero', path: () => `/curation/featured/${ids.hero}`, height: 1500 },
    {
      name: 'section-rule',
      path: (c) => `/curation/featured/${c.seeded.drawsOn.id}`,
      height: 1300,
    },
    {
      name: 'section-picked',
      path: (c) => `/curation/featured/${c.seeded.picks.id}`,
      height: 1300,
    },
    {
      name: 'preview-tv',
      path: () => `/curation/featured/${ids.hero}`,
      act: previewOn('TV'),
      crop: preview,
    },
    {
      name: 'preview-announcement',
      path: () => `/curation/announcements/${ids.live}`,
      height: 1500,
      act: async (p) => {
        await previewOn('Mobile')(p)
        await p.getByRole('combobox', { name: 'Preview as' }).click()
        await p.getByRole('option', { name: /^Theo/ }).click()
      },
      crop: preview,
    },
  ],
} satisfies Area
