// SPDX-License-Identifier: AGPL-3.0-only
// The Quality and profiles guide's screenshots (apps/docs/content/settings/quality/): Settings ›
// Profiles and formats, the seeded HD 1080p profile and x265 format in their editors, and Settings ›
// Quality sizes with its editor.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

/** The card a heading starts. */
const card = (name: string) => (p: Page) =>
  p
    .getByRole('heading', { name, exact: true })
    .locator('xpath=ancestor::*[contains(@class,"rounded")][1]')

export default {
  shots: [
    { name: 'profiles', path: '/settings/profiles', crop: card('Quality profiles') },
    { name: 'formats', path: '/settings/profiles', crop: card('Custom formats') },
    { name: 'presets', path: '/settings/profiles', crop: card('Presets from the catalog') },
    { name: 'profile', path: '/settings/profiles/qp-hd', crop: card('Profile') },
    {
      name: 'qualities',
      path: '/settings/profiles/qp-hd',
      height: 1000,
      act: (p) => p.getByRole('button', { name: 'More for WEB 1080p' }).click(),
    },
    {
      name: 'upgrades',
      path: '/settings/profiles/qp-hd',
      height: 2400,
      crop: card('Upgrades'),
    },
    {
      name: 'scores',
      path: '/settings/profiles/qp-hd',
      height: 2600,
      crop: card('Custom format scores'),
    },
    {
      name: 'format',
      path: '/settings/profiles/formats/cf-x265',
      height: 960,
      act: (p) =>
        p
          .getByRole('textbox', { name: 'Release name', exact: true })
          .fill('Sintel.2010.1080p.BluRay.x265.DTS-HDX'),
    },
    { name: 'sizes', path: '/settings/quality' },
    { name: 'sizes-editor', path: '/settings/quality/sizes' },
  ],
} satisfies Area
