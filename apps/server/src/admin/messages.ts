// SPDX-License-Identifier: AGPL-3.0-only
// The admin shell's strings (ADR 0021). English is the source; it's the prototype's copy.
import { defineMessages } from '@highsea/i18n'

export const shell = defineMessages({
  skip: 'Skip to content',
  menu: 'Menu',
  'nav.dashboard': 'Dashboard',
  'nav.discover': 'Discover',
  'nav.movies': 'Movies',
  'nav.wanted': 'Wanted',
  'nav.activity': 'Activity',
  'nav.downloads': 'Downloads',
  'nav.indexers': 'Indexers',
  'nav.subtitles': 'Subtitles',
  'nav.curation': 'Curation',
  'nav.settings': 'Settings',
  'nav.system': 'System',
  'server.version': 'v{version}',
  'dashboard.title': 'Dashboard',
  'dashboard.soon': 'The dashboard comes next',
  'dashboard.soonBody':
    '{name} is running. Its widgets arrive with personalization, at checkpoint 3 of the server plan.',
  'dashboard.loading': 'Reaching the server…',
  'dashboard.error': 'Couldn’t reach the server',
  'notFound.title': 'There’s nothing here yet',
  'notFound.body': 'This page is built in a later checkpoint of the server plan.',
  'notFound.home': 'Go to the dashboard',
})
