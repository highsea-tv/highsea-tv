// SPDX-License-Identifier: AGPL-3.0-only
// The Downloads guide's screenshots (apps/docs/content/downloads/).
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const dialog = (p: Page) => p.getByRole('dialog')

/** A torrent's details, on the given tab. */
const sheet = (name: RegExp, tab?: string) => async (p: Page) => {
  await p.getByRole('button', { name }).first().click()
  if (tab)
    await p
      .getByRole('dialog')
      .getByRole('tab', { name: new RegExp(`^${tab}`) })
      .click()
}

export default {
  shots: [
    { name: 'overview', path: '/downloads' },
    {
      name: 'add',
      path: '/downloads',
      act: (p) => p.getByRole('button', { name: 'Add torrent' }).click(),
      crop: dialog,
    },
    {
      name: 'limits',
      path: '/downloads',
      act: (p) => p.getByRole('button', { name: 'Limits' }).click(),
      crop: dialog,
    },
    // the details sheet is as tall as the window: a short window keeps it to its contents
    {
      name: 'details-general',
      path: '/downloads',
      act: sheet(/Sintel/),
      crop: dialog,
      height: 490,
    },
    {
      name: 'details-files',
      path: '/downloads',
      act: sheet(/Sintel/, 'Files'),
      crop: dialog,
      height: 270,
    },
    {
      name: 'details-trackers',
      path: '/downloads',
      act: sheet(/Sintel/, 'Trackers'),
      crop: dialog,
      height: 300,
    },
    {
      name: 'details-seeding',
      path: '/downloads',
      act: sheet(/Sintel/, 'Seeding'),
      crop: dialog,
      height: 290,
    },
    {
      name: 'import-menu',
      path: '/downloads',
      act: async (p) => {
        await sheet(/Home\.Movies/)(p)
        await p.getByRole('button', { name: /^More for Home\.Movies/ }).click()
      },
      height: 400,
    },
    {
      name: 'remove',
      path: '/downloads',
      act: async (p) => {
        await sheet(/Sintel/)(p)
        await p.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
      },
      crop: (p) => p.getByRole('alertdialog'),
    },
  ],
} satisfies Area
