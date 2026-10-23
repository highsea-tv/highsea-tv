// SPDX-License-Identifier: AGPL-3.0-only
// The Download client guide's screenshots (apps/docs/content/settings/downloads/).
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const region = (name: string) => (p: Page) => p.getByRole('region', { name })

export default {
  shots: [
    { name: 'overview', path: '/settings/downloads' },
    { name: 'connections', path: '/settings/downloads', crop: region('Connections') },
    { name: 'seeding', path: '/settings/downloads', crop: region('Seeding') },
    {
      name: 'categories',
      path: '/settings/downloads',
      crop: region('Categories'),
      height: 1400,
    },
    {
      name: 'watch-folder',
      path: '/settings/downloads',
      crop: region('Watch folder'),
      height: 1400,
    },
  ],
} satisfies Area
