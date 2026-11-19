// SPDX-License-Identifier: AGPL-3.0-only
// The Shows guide's screenshots (apps/docs/content/shows/), from the seeded server's Chernobyl: two
// episodes on disk and a recap its name can't place (scripts/sweeps/seeded.ts).
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const blur = (p: Page) => p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
const blurDialog = async (p: Page) => {
  await p.getByRole('dialog').waitFor()
  await p.waitForTimeout(300)
  await blur(p)
}

// the admin shows a page once it has hydrated (apps/server/src/admin/providers.tsx's data-hydrated);
// on the dev server a show's page can load again while its first compile settles, so the shot waits
// until it has stayed hydrated for two seconds
const titled = async (p: Page) => {
  for (let tries = 0; tries < 10; tries++) {
    await p.locator('[data-hydrated]').waitFor({ state: 'attached', timeout: 60_000 })
    await p.waitForTimeout(2000)
    if (await p.locator('[data-hydrated]').count()) break
  }
  await p.getByRole('heading', { name: 'Chernobyl', exact: true }).first().waitFor()
}

export default {
  shots: [
    { name: 'library', path: '/shows' },
    { name: 'show', path: '/shows/87108', act: titled, height: 1000 },
    {
      name: 'show-more',
      path: '/shows/87108',
      act: async (p) => {
        await titled(p)
        await p.getByRole('button', { name: 'More actions' }).click()
        await p.getByRole('menuitem', { name: 'Refresh metadata' }).waitFor()
      },
    },
    { name: 'unmatched', path: '/shows/unmatched' },
    {
      name: 'match-file',
      path: '/shows/unmatched',
      act: async (p) => {
        await p.getByRole('button', { name: /^Match .*Recap/ }).click()
        await blurDialog(p)
      },
      crop: (p) => p.getByRole('dialog'),
    },
  ],
} satisfies Area
