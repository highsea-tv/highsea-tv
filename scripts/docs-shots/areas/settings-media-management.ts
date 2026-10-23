// SPDX-License-Identifier: AGPL-3.0-only
// The Media management guide's screenshots (apps/docs/content/settings/media-management/): its
// Naming, Importing and Tags cards, the root folders the seed made, and removing a tag.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

/** The card a heading starts. */
const card = (name: string) => (p: Page) =>
  p
    .getByRole('heading', { name, exact: true })
    .locator('xpath=ancestor::*[contains(@class,"rounded")][1]')

export default {
  shots: [
    { name: 'page', path: '/settings/media' },
    { name: 'naming', path: '/settings/media', crop: card('Naming') },
    {
      name: 'importing',
      path: '/settings/media',
      height: 1600,
      crop: card('Importing'),
    },
    {
      name: 'root-folders',
      path: '/settings/media',
      height: 1600,
      crop: (p) =>
        p.getByRole('heading', { name: 'Root folders', exact: true }).locator('xpath=../..'),
    },
    { name: 'tags', path: '/settings/media', height: 1800, crop: card('Tags') },
    {
      name: 'tag-remove',
      path: '/settings/media',
      act: (p) => p.getByRole('button', { name: 'Remove Kids' }).click(),
      crop: (p) => p.getByRole('alertdialog'),
    },
  ],
} satisfies Area
