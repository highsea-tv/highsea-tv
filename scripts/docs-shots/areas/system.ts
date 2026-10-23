// SPDX-License-Identifier: AGPL-3.0-only
// The System guide's screenshots (apps/docs/content/system/), and System › Updates for Upgrading.
import type { Area } from '../shot.ts'

let network: Record<string, unknown> = {}

export default {
  // a backup to list and restore, and a remote address on plain HTTP, so Health has a warning to show
  prepare: async (c) => {
    await c.api('POST', '/system/backups')
    const { localAddresses, discoveryPort, tlsProblem, ...settings } = await c.api<
      Record<string, unknown>
    >('GET', '/settings/network')
    network = settings
    await c.api('PUT', '/settings/network', {
      ...network,
      remoteAccess: 'port-forward',
      externalUrl: 'http://harbor.example.net:3000',
    })
  },
  finish: (c) => c.api('PUT', '/settings/network', network),
  shots: [
    { name: 'status', path: '/system' },
    { name: 'health', path: '/system/health' },
    { name: 'tasks', path: '/system/tasks', height: 1100 },
    { name: 'logs', path: '/system/logs' },
    { name: 'events', path: '/system/events' },
    { name: 'backups', path: '/system/backups' },
    {
      name: 'backups-restore',
      path: '/system/backups',
      act: (p) =>
        p
          .getByRole('button', { name: /^Restore the backup from/ })
          .first()
          .click(),
      crop: (p) => p.getByRole('alertdialog'),
    },
    {
      // the seed's catalog names no release, so the server's own answer is given a newer one: a patch
      // release with neutral notes, which promises nothing about what comes next
      name: 'updates-available',
      path: '/system/updates',
      act: async (p) => {
        await p.route('**/api/v1/system/updates', async (route) => {
          const res = await route.fetch()
          const u = (await res.json()) as { current: string; checkedAt: string | null }
          await route.fulfill({
            response: res,
            json: {
              ...u,
              available: true,
              checkedAt: u.checkedAt ?? new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              latest: {
                version: '0.1.1',
                channel: 'stable',
                date: '2026-11-12',
                notes: ['Fixes and small improvements. The changelog lists each one.'],
                url: 'https://github.com/highsea-tv/highsea-tv/releases',
              },
            },
          })
        })
        await p.reload()
        await p.getByText('highsea 0.1.1 is out').waitFor()
      },
    },
  ],
} satisfies Area
