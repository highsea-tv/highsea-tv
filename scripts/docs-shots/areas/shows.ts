// SPDX-License-Identifier: AGPL-3.0-only
// The Shows guide's screenshots (apps/docs/content/shows/), from the seeded server's Chernobyl: two
// episodes on disk and a recap its name can't place (scripts/sweeps/seeded.ts).
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import type { Area, Context } from '../shot.ts'

type Unmatched = { path: string; kind: string }
// a second Chernobyl folder for the folder's Match dialog: the scan finds the show already here
// (TMDB's search for "Chernobyl" is in the replay's fixtures), so Unmatched lists the folder
const second = (c: Context) => join(c.server.dir, 'data', 'tv', 'Chernobyl')
// the scan files its rows as it goes: wait until the folder and the recap are both there, and stay
const settled = async (c: Context) => {
  let steady = 0
  for (let i = 0; i < 240; i++) {
    const rows = await c.api<Unmatched[]>('GET', '/series/unmatched')
    const both =
      rows.some((r) => r.path === second(c)) && rows.some((r) => r.path.endsWith('Recap.mkv'))
    steady = both ? steady + 1 : 0
    if (steady >= 8) return
    await Bun.sleep(250)
  }
  throw new Error('Unmatched never settled with the second Chernobyl folder and the recap')
}
const listed = (p: Page) =>
  p.getByRole('button', { name: /^Match .*Recap/ }).waitFor({ timeout: 60_000 })

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

const openFolder = async (p: Page) => {
  await listed(p)
  await p.getByRole('button', { name: /^Match .*Chernobyl$/ }).click()
  await blurDialog(p)
}

export default {
  prepare: async (c) => {
    const tv = join(c.server.dir, 'data', 'tv')
    mkdirSync(join(second(c), 'Season 01'), { recursive: true })
    copyFileSync(
      join(tv, 'Chernobyl (2019)', 'Season 01', 'Chernobyl.S01E01.mkv'),
      join(second(c), 'Season 01', 'Chernobyl.S01E01.mkv'),
    )
    const folders = await c.api<{ id: string; path: string }[]>('GET', '/rootfolders')
    const root = folders.find((f) => f.path === tv)
    if (!root) throw new Error('no shows root folder in the seed')
    await c.api('POST', `/rootfolders/${root.id}/scan`)
    await settled(c)
  },
  // the folder goes, and its row with it, so other areas' pages show the seed as it was
  finish: async (c) => {
    await c.api('POST', '/series/unmatched/dismiss', { path: second(c) })
    rmSync(second(c), { recursive: true, force: true })
  },
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
    { name: 'unmatched', path: '/shows/unmatched', act: listed },
    {
      name: 'match-file',
      path: '/shows/unmatched',
      act: async (p) => {
        await listed(p)
        await p.getByRole('button', { name: /^Match .*Recap/ }).click()
        await blurDialog(p)
      },
    },
    {
      name: 'match-folder',
      path: '/shows/unmatched',
      act: async (p) => {
        await openFolder(p)
        // TMDB's answer is in: the Show field's hint "Searching…" has gone
        await p.getByText('Searching…').waitFor({ state: 'detached', timeout: 60_000 })
      },
    },
    {
      name: 'match-folder-list',
      path: '/shows/unmatched',
      // the Show list open, with TMDB's two Chernobyls: the one in the library can't be picked
      act: async (p) => {
        await openFolder(p)
        await p
          .getByRole('dialog')
          .getByRole('button', { name: 'Show', exact: true })
          .click({ timeout: 60_000 })
        await p
          .getByRole('menuitemradio', { name: 'Chernobyl (2022)' })
          .waitFor({ timeout: 60_000 })
      },
    },
  ],
} satisfies Area
