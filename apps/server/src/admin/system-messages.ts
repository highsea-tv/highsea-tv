// SPDX-License-Identifier: AGPL-3.0-only
// System (ADR 0021): the page header from the prototype, and About, which checkpoint 4 adds for
// TMDB's attribution (system.md; the prototype has no About).
import { defineMessages } from '@highsea/i18n'

export const system = defineMessages({
  title: 'System',
  description: 'What the server is doing, and how it’s holding up.',
  what: 'the server’s details',
  'about.title': 'About',
  'about.description': 'This server, and the services whose data it shows.',
  'about.name': 'Server',
  'about.version': 'Version',
  'about.data': 'Data from',
  later:
    'Status, health, tasks, logs, events, backups and updates arrive in a later checkpoint of the server plan.',
})
