// SPDX-License-Identifier: AGPL-3.0-only
// The Discover and Movies guide's screenshots (apps/docs/content/movies/).
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

// a clicked tab, or a dialog's first field, keeps its focus ring in the shot, so focus moves off it
const blur = (p: Page) => p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
// a dialog focuses its first control once it has opened
const blurDialog = async (p: Page) => {
  await p.getByRole('dialog').waitFor()
  await p.waitForTimeout(300)
  await blur(p)
}
const panel = (p: Page) => p.getByRole('tabpanel')
const table = (p: Page) => p.getByRole('radio', { name: 'Table' }).click()
const more = (p: Page) => p.getByRole('button', { name: 'More actions' }).click()

export default {
  shots: [
    // Discover
    { name: 'discover', path: '/discover' },
    { name: 'discover-search', path: '/discover?q=sintel' },
    {
      name: 'add-dialog',
      path: '/discover',
      act: (p) => p.getByRole('button', { name: /^Add / }).first().click(),
      crop: (p) => p.getByRole('dialog'),
    },
    // The library
    { name: 'library-grid', path: '/movies' },
    { name: 'library-table', path: '/movies', act: table },
    {
      name: 'library-selection',
      path: '/movies',
      act: async (p) => {
        await table(p)
        await p.getByRole('checkbox').nth(1).check()
        await p.getByRole('checkbox').nth(2).check()
        await p.getByRole('button', { name: 'Edit', exact: true }).click()
      },
    },
    // A film's page
    { name: 'film', path: '/movies/45745', height: 1000 },
    {
      name: 'film-versions',
      path: '/movies/45745',
      crop: (p) => p.getByRole('region', { name: 'In the library', exact: true }),
    },
    { name: 'film-search', path: '/movies/45745/search', crop: panel },
    { name: 'film-files', path: '/movies/45745/files', crop: panel },
    { name: 'film-history', path: '/movies/45745/history', crop: panel },
    { name: 'film-subtitles', path: '/movies/45745/subtitles', crop: panel },
    { name: 'film-more', path: '/movies/45745', act: more },
    {
      name: 'film-edit',
      path: '/movies/45745',
      act: async (p) => {
        await more(p)
        await p.getByRole('menuitem', { name: 'Edit' }).click()
        await blurDialog(p)
      },
      crop: (p) => p.getByRole('dialog'),
    },
    {
      name: 'film-remove',
      path: '/movies/45745',
      act: async (p) => {
        await more(p)
        await p.getByRole('menuitem', { name: 'Remove from library' }).click()
        // a confirmation is a dialog (the library's ConfirmDialog, confirm-dialog.tsx)
        await p.getByRole('dialog').waitFor()
        await p.waitForTimeout(300)
        await blur(p)
      },
      crop: (p) => p.getByRole('dialog'),
    },
    { name: 'film-not-added', path: '/movies/19', height: 1000 },
    // People and collections
    { name: 'person', path: '/people/68', height: 1300 },
    {
      name: 'film-collection',
      path: '/movies/969681',
      act: (p) => p.getByRole('button', { name: /^Add \d+ missing$/ }).scrollIntoViewIfNeeded(),
      crop: (p) =>
        p
          .getByRole('group')
          .filter({ has: p.getByRole('button', { name: /^Add \d+ missing$/ }) })
          .last(),
    },
    { name: 'collection', path: '/collections/531241' },
  ],
} satisfies Area
