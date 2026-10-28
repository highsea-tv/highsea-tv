// SPDX-License-Identifier: AGPL-3.0-only
// The Watching guide's screenshots (apps/docs/content/watch/): the web app at /web, signed in as
// the seed's owner, as any Admin or User sees it.
import type { Area } from '../shot.ts'

export default {
  shots: [
    {
      name: 'home',
      path: '/web/',
      act: async (p) => {
        await p.getByRole('navigation', { name: 'Main' }).first().waitFor()
        await p.locator('main h2').first().waitFor()
      },
    },
    {
      name: 'library',
      path: '/web/library',
      act: (p) =>
        p
          .getByRole('link', { name: /Sintel/ })
          .first()
          .waitFor(),
    },
    {
      name: 'film',
      path: '/web/movies/45745',
      act: (p) => p.getByRole('heading', { name: 'Sintel', level: 1 }).waitFor(),
    },
    {
      // the panel, with the release's English subtitle on, so Subtitle timing shows
      name: 'tracks',
      path: '/web/play/45745',
      height: 900,
      act: async (p) => {
        await p.getByRole('button', { name: 'Audio and subtitles' }).click()
        await p
          .locator('[role=radiogroup][aria-labelledby=p-subs] label')
          .filter({ hasText: /^English$/ })
          .click()
        await p.getByRole('heading', { name: 'Subtitle timing' }).waitFor()
      },
      crop: (p) => p.getByRole('complementary', { name: 'Audio and subtitles' }),
    },
  ],
} satisfies Area
