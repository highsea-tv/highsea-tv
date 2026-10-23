// SPDX-License-Identifier: AGPL-3.0-only
// The Indexers guide's screenshots (apps/docs/content/indexers/). Search results come from the fake
// indexer through Sintel's Search tab; the backoff shot makes the Internet Archive fail its test, so
// it's last, after every shot that searches.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const dialog = (p: Page) => p.getByRole('dialog')
const tab = (name: string | RegExp) => (p: Page) => p.getByRole('tab', { name }).click()

export default {
  shots: [
    {
      name: 'search-results',
      path: '/movies/45745',
      act: tab('Search'),
      crop: (p) => p.getByRole('tabpanel'),
      height: 1000,
    },
    {
      name: 'search-reasons',
      path: '/movies/45745',
      act: async (p) => {
        await tab('Search')(p)
        await p
          .getByRole('button', { name: /^Rejected \(2\)/ })
          .first()
          .click()
      },
      crop: (p) => p.getByRole('tabpanel'),
      height: 1100,
    },
    { name: 'overview', path: '/indexers' },
    {
      name: 'row-menu',
      path: '/indexers',
      act: (p) => p.getByRole('button', { name: 'More for Torznab' }).click(),
      height: 480,
    },
    { name: 'catalog', path: '/indexers', act: tab('Catalog') },
    {
      name: 'what-changed',
      path: '/indexers',
      act: (p) => p.getByRole('button', { name: 'What changed' }).click(),
      crop: dialog,
    },
    {
      name: 'set-up-feed',
      path: '/indexers',
      act: async (p) => {
        await tab('Catalog')(p)
        await p.getByRole('button', { name: 'Set up Torrent feed' }).click()
      },
      crop: dialog,
    },
    {
      name: 'edit',
      path: '/indexers',
      act: async (p) => {
        await p.getByRole('button', { name: 'More for Torznab' }).click()
        await p.getByRole('menuitem', { name: 'Edit' }).click()
        // the dialog focuses its close button; the ring would draw the eye
        await p.getByRole('dialog').getByRole('heading').first().click()
      },
      crop: dialog,
      height: 1400,
    },
    {
      name: 'backing-off',
      path: '/indexers',
      act: async (p, c) => {
        c.server.indexer.fake.misbehave({ kind: 'status', status: 503 }, '/archive')
        try {
          await p.getByRole('button', { name: 'More for Internet Archive' }).click()
          await p.getByRole('menuitem', { name: 'Test' }).click()
          await p.getByText('Backing off').first().waitFor()
        } finally {
          c.server.indexer.fake.misbehave(null, '/archive')
        }
        await p.getByRole('button', { name: 'Dismiss' }).click()
        await p
          .getByRole('region', { name: /Notification/ })
          .waitFor({ state: 'detached' })
          .catch(() => {})
      },
      crop: (p) => p.locator('main table'),
    },
  ],
} satisfies Area
