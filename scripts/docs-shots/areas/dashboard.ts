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
    {
      // Weather's settings with a place found by the place search (HIGHSEA_WEATHER_FAKE answers it)
      name: 'weather-settings',
      path: '/',
      crop: (p) => p.getByRole('dialog', { name: 'Weather settings' }),
      act: async (p) => {
        await customize(p)
        await p.getByRole('button', { name: 'Add widget' }).first().click()
        await p.getByRole('dialog').getByText('Weather', { exact: true }).click()
        await p.getByRole('button', { name: 'Weather settings' }).click()
        const sheet = p.getByRole('dialog', { name: 'Weather settings' })
        await sheet.getByRole('textbox', { name: 'Search for a place' }).fill('Lisbon')
        await sheet.getByRole('button', { name: 'Search', exact: true }).click()
        await sheet.getByText('Lisbon, Portugal').click()
      },
    },
  ],
} satisfies Area
