// SPDX-License-Identifier: AGPL-3.0-only
// The Dashboard guide's screenshots (apps/docs/content/dashboard/).
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const customize = (p: Page) => p.getByRole('button', { name: 'Customize' }).click()

export default {
  shots: [
    { name: 'overview', path: '/' },
    { name: 'customize', path: '/', act: customize },
    {
      name: 'add-widget',
      path: '/',
      act: async (p) => {
        await customize(p)
        await p.getByRole('button', { name: 'Add widget' }).first().click()
      },
    },
    {
      name: 'layout-options',
      path: '/',
      act: async (p) => {
        await customize(p)
        await p.getByRole('button', { name: 'More layout options' }).click()
      },
    },
  ],
} satisfies Area
