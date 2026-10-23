// SPDX-License-Identifier: AGPL-3.0-only
// The Subtitles guide's screenshots (apps/docs/content/subtitles/): the page and its tabs, and a
// film's Subtitles tab, Synced (Sintel) and Not synced (Nosferatu), with a provider search.
// Nosferatu is given a profile that also asks for French, so the Wanted tab has a film on it.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

// the tab, then its focus ring off, as a mouse click would leave it
const tab = (name: string) => async (p: Page) => {
  await p.getByRole('tab', { name }).click()
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}
const panel = (p: Page) => p.getByRole('tabpanel')

export default {
  prepare: async (c) => {
    const body = {
      name: 'English and French',
      languages: [
        { code: 'en', forced: 'also', hi: 'no' },
        { code: 'fr', forced: 'no', hi: 'no' },
      ],
      cutoff: null,
      minScore: 80,
    }
    const profile = await c.api<{ id: string }>('POST', '/languageprofiles', body)
    await c.api('POST', '/movies/bulk', {
      action: 'setLanguageProfile',
      ids: [653],
      languageProfileId: profile.id,
    })
    // the bulk change doesn't rewrite the wanted rows; saving the profile again does, for every film
    await c.api('PUT', `/languageprofiles/${profile.id}`, body)
  },
  shots: [
    {
      name: 'overview',
      path: '/subtitles',
      // the wanted rows are rewritten by a job after the profile changes, which may finish after
      // the page has loaded: load it again until they're there
      act: async (p) => {
        for (let i = 0; i < 30 && !(await p.getByText('Nosferatu').first().isVisible()); i++) {
          await p.waitForTimeout(2000)
          await p.reload()
          await p.getByRole('main').waitFor()
        }
        await p.getByText('Nosferatu').first().waitFor({ timeout: 5000 })
      },
    },
    { name: 'providers', path: '/subtitles', act: tab('Providers') },
    {
      name: 'provider-edit',
      path: '/subtitles',
      act: async (p) => {
        await tab('Providers')(p)
        await p.getByRole('button', { name: 'Edit Subdl' }).click()
      },
      crop: (p) => p.getByRole('dialog'),
    },
    { name: 'languages', path: '/subtitles', act: tab('Languages') },
    {
      name: 'profile-edit',
      path: '/subtitles',
      act: async (p) => {
        await tab('Languages')(p)
        await p
          .getByRole('button', { name: /^Edit / })
          .first()
          .click()
      },
      crop: panel,
      height: 1100,
    },
    {
      name: 'scoring',
      path: '/subtitles',
      act: tab('Scoring and sync'),
      crop: panel,
    },
    {
      name: 'film-synced',
      path: '/movies/45745',
      act: tab('Subtitles'),
      crop: panel,
    },
    {
      name: 'film-not-synced',
      path: '/movies/653',
      act: tab('Subtitles'),
      crop: panel,
    },
    {
      name: 'film-search',
      path: '/movies/45745',
      act: async (p) => {
        await tab('Subtitles')(p)
        await p.getByRole('button', { name: 'Search providers' }).click()
        await p
          .getByRole('button', { name: /^Download .+ from / })
          .first()
          .waitFor()
      },
      crop: panel,
      height: 1100,
    },
  ],
} satisfies Area
