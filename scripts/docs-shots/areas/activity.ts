// SPDX-License-Identifier: AGPL-3.0-only
// The Activity guide's screenshots (apps/docs/content/activity/).
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

// a tab chosen, without the focus ring the click leaves on it
const tab = (name: string | RegExp) => async (p: Page) => {
  await p.getByRole('tab', { name }).click()
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}
const main = (p: Page) => p.locator('main')

export default {
  shots: [
    { name: 'queue', path: '/activity', crop: main },
    {
      name: 'queue-menu',
      path: '/activity',
      // the menu opens below main's box, so the viewport is kept, short enough to leave little empty
      height: 420,
      act: (p) =>
        p
          .getByRole('button', { name: /^More for / })
          .first()
          .click(),
    },
    { name: 'history', path: '/activity', act: tab('History'), crop: main },
    { name: 'blocklist', path: '/activity', act: tab(/Blocklist/), crop: main },
    {
      // the seed's Nosferatu release, already imported, so the row is matched and named
      name: 'manual-import',
      path: (c) =>
        `/activity/import?path=${encodeURIComponent(join(c.server.dataDir, 'downloads', 'Nosferatu.1922.1080p.BluRay.x264-GRP'))}`,
      crop: main,
    },
    {
      // the seeded library's root folder, whose film folders highsea already knows
      name: 'library-import',
      path: (c) =>
        `/activity/import?mode=library&root=${encodeURIComponent(join(c.server.dataDir, 'movies'))}`,
      crop: main,
    },
  ],
} satisfies Area
