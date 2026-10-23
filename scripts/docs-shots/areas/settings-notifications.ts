// SPDX-License-Identifier: AGPL-3.0-only
// The Notifications guide's screenshots (apps/docs/content/settings/notifications/): Settings ›
// Connections with a few connections added through the API (nothing is sent: the server is
// offline), the add and edit dialogs. The Email connection's dialog isn't shot: its From hint,
// `highsea <media@example.org>`, isn't valid ICU (a tag), so the dialog fails to render.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const main = (p: Page) => p.locator('main')
const dialog = (p: Page) => p.getByRole('dialog')

export default {
  prepare: async (c) => {
    const tags = await c.api<{ id: string; label: string }[]>('GET', '/tags')
    const kids = tags.find((t) => t.label === 'Kids')?.id
    await c.api('POST', '/connections', {
      kind: 'discord',
      name: 'Family Discord',
      enabled: true,
      events: ['imported', 'upgraded', 'download-failed', 'health', 'update'],
      settings: {
        webhookUrl: 'https://discord.com/api/webhooks/1234567890/harbor-example-abcd',
        username: 'highsea',
      },
    })
    await c.api('POST', '/connections', {
      kind: 'ntfy',
      name: 'Kids’ films on my phone',
      enabled: true,
      events: ['imported', 'subtitle-added'],
      settings: { serverUrl: 'https://ntfy.sh', topic: 'harbor-kids', priority: 3 },
      tags: kids ? [kids] : [],
    })
    await c.api('POST', '/connections', {
      kind: 'email',
      name: 'Household mail',
      enabled: true,
      events: ['health', 'update'],
      settings: {
        host: 'smtp.example.org',
        port: 587,
        security: 'starttls',
        username: 'media@example.org',
        password: 'example-password',
        from: 'highsea <media@example.org>',
        to: 'ines@example.org',
      },
      serverMail: true,
    })
  },
  shots: [
    { name: 'connections', path: '/settings/connections', crop: main, height: 1300 },
    {
      name: 'add-discord',
      path: '/settings/connections',
      act: (p) => p.getByRole('button', { name: 'Discord', exact: true }).click(),
      crop: dialog,
      height: 1000,
    },
    {
      name: 'edit-tags',
      path: '/settings/connections',
      act: (p) => p.getByRole('button', { name: 'Edit Kids’ films on my phone' }).click(),
      crop: dialog,
      height: 1200,
    },
    {
      // the Email connection's row, with its Server's mail switch
      name: 'server-mail',
      path: '/settings/connections',
      crop: (p) =>
        p
          .getByRole('list', { name: 'Notifications' })
          .getByRole('listitem')
          .filter({ hasText: 'Household mail' }),
    },
    {
      name: 'this-browser',
      path: '/settings/connections',
      crop: (p) =>
        p
          .locator('section')
          .filter({ has: p.getByRole('heading', { name: 'This browser' }) })
          .last(),
      height: 1300,
    },
  ],
} satisfies Area
