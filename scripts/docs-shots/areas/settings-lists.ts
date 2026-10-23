// SPDX-License-Identifier: AGPL-3.0-only
// The Import lists guide's screenshots (apps/docs/content/settings/lists/): a TMDB list answered
// from the recorded TMDB responses (no network), an exclusion, and the Add a list dialog for each
// kind. Trakt's device sign-in needs trakt.tv, so it isn't shown.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const dialog = (p: Page) => p.getByRole('dialog')
const add = (kind?: string) => async (p: Page) => {
  await p.getByRole('button', { name: 'Add a list' }).click()
  if (kind) await p.getByRole('dialog').getByText(kind, { exact: true }).click()
}

export default {
  async prepare(c) {
    // a film removed and kept from coming back, for Exclusions
    await c.api('DELETE', '/movies/832?exclude=true')
    // a public TMDB list in the recordings
    await c.api('POST', '/import-lists', {
      name: 'Blender open films',
      enabled: true,
      settings: { kind: 'tmdb', source: 'list', list: '8512345' },
      rootFolder: `${c.server.dataDir}/movies`,
      qualityProfileId: 'qp-hd',
      languageProfileId: null,
      monitored: true,
      minimumAvailability: 'released',
      searchOnAdd: false,
      tags: [],
    })
    // so the row reads "Checked 3s ago" rather than a moment in the future
    await Bun.sleep(3000)
  },
  shots: [
    { name: 'page', path: '/settings/lists', height: 860, crop: (p) => p.locator('main') },
    { name: 'add-tmdb', path: '/settings/lists', height: 1400, act: add(), crop: dialog },
    {
      // Trakt's charts and the watchlist, in the List menu
      name: 'add-trakt',
      path: '/settings/lists',
      height: 1400,
      act: async (p) => {
        await add('Trakt')(p)
        await p.getByRole('dialog').getByRole('combobox', { name: 'List' }).click()
      },
      // the open menu hides the dialog from the accessibility tree
      crop: (p) => p.locator('[role="dialog"]'),
    },
    {
      name: 'add-generic',
      path: '/settings/lists',
      height: 1400,
      act: add('Generic list'),
      crop: dialog,
    },
    {
      name: 'remove-film',
      path: '/movies/653',
      act: async (p) => {
        await p.getByRole('button', { name: 'More actions' }).click()
        await p.getByRole('menuitem', { name: 'Remove from library' }).click()
        await p.getByText('Don’t add it again from lists').click()
      },
      crop: (p) => p.getByRole('alertdialog'),
    },
  ],
} satisfies Area
