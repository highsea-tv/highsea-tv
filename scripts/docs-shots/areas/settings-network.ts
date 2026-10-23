// SPDX-License-Identifier: AGPL-3.0-only
// The Network and remote access guide's screenshots (apps/docs/content/settings/network/). Discovery
// isn't shown: the seeded server listens on a test port, not 7368.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const tls = (name: string) => (p: Page) => p.getByRole('radio', { name, exact: true }).click()
const region = (name: string) => (p: Page) => p.getByRole('region', { name })

export default {
  shots: [
    { name: 'remote-access', path: '/settings/network', crop: region('Remote access') },
    {
      name: 'proxy',
      path: '/settings/network',
      act: tls('My proxy handles it'),
      crop: region('Reverse proxy and TLS'),
    },
    {
      name: 'built-in-tls',
      path: '/settings/network',
      act: tls('Built in'),
      crop: region('Reverse proxy and TLS'),
    },
  ],
} satisfies Area
