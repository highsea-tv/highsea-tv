// SPDX-License-Identifier: AGPL-3.0-only
// The General settings guide's screenshots (apps/docs/content/settings/general/).
import type { Area } from '../shot.ts'

export default {
  // metrics on, so Diagnostics shows the address Prometheus scrapes; the log level at its default
  // (the seeded server starts at warn)
  prepare: async (c) => {
    await c.api('PUT', '/settings/metrics', { enabled: true })
    const general = await c.api<Record<string, unknown>>('GET', '/settings/general')
    await c.api('PUT', '/settings/general', { ...general, logLevel: 'info' })
  },
  shots: [
    { name: 'overview', path: '/settings/general' },
    {
      name: 'metadata',
      path: '/settings/general',
      crop: (p) => p.getByRole('region', { name: 'Metadata' }),
    },
    {
      name: 'catalog',
      path: '/settings/general',
      crop: (p) => p.getByRole('region', { name: 'Indexer catalog' }),
    },
    {
      name: 'diagnostics',
      path: '/settings/general',
      crop: (p) => p.getByRole('region', { name: 'Diagnostics' }),
    },
  ],
} satisfies Area
