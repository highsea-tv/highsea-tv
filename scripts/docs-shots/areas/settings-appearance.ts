// SPDX-License-Identifier: AGPL-3.0-only
// The Appearance settings guide's screenshots (apps/docs/content/settings/appearance/).
import type { Area } from '../shot.ts'

export default {
  shots: [
    { name: 'overview', path: '/settings/appearance' },
    {
      name: 'themes',
      path: '/settings/appearance',
      crop: (p) => p.getByRole('region', { name: 'Themes' }),
    },
    {
      name: 'new-theme',
      path: '/settings/appearance',
      act: async (p) => {
        await p.getByRole('button', { name: 'New theme' }).click()
        await p
          .getByRole('region', { name: 'New theme' })
          .getByLabel('Name', { exact: true })
          .fill('Harbor night')
      },
      crop: (p) => p.getByRole('region', { name: 'New theme' }),
    },
    {
      name: 'sounds',
      path: '/settings/appearance',
      crop: (p) => p.getByRole('region', { name: 'Sounds' }),
    },
  ],
} satisfies Area
