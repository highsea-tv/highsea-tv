// SPDX-License-Identifier: AGPL-3.0-only
// The Wanted guide's screenshots (apps/docs/content/wanted/).
import type { Area } from '../shot.ts'

export default {
  shots: [
    { name: 'missing', path: '/wanted', crop: (p) => p.locator('main') },
    { name: 'cutoff', path: '/wanted/cutoff', crop: (p) => p.locator('main') },
    {
      // The Cat in the Hat (1117898) comes out next month in the recordings
      name: 'calendar',
      path: '/wanted/calendar',
      height: 1000,
      act: (p) => p.getByRole('button', { name: 'Next month' }).click(),
      crop: (p) => p.locator('main'),
    },
    {
      name: 'feed',
      path: '/wanted/calendar',
      height: 1200,
      act: async (p) => {
        await p.getByRole('button', { name: 'Make a feed address' }).click()
        await p.getByRole('button', { name: 'Make a new address' }).waitFor()
      },
      crop: (p) =>
        p
          .locator('main div')
          .filter({ has: p.getByRole('textbox', { name: 'Subscribe in your calendar app' }) })
          .filter({ hasText: 'An iCal feed' })
          .last(),
    },
  ],
} satisfies Area
