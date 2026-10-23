// SPDX-License-Identifier: AGPL-3.0-only
// The Collections guide's screenshots (apps/docs/content/collections/), from the seed's three
// collections: rules with a group, picked by hand, and one that matches nothing.
import type { Area } from '../shot.ts'

export default {
  shots: [
    { name: 'list', path: '/collections' },
    { name: 'rules', path: (c) => `/collections/${c.seeded.decade.id}`, height: 1400 },
    { name: 'picked', path: (c) => `/collections/${c.seeded.handPicked.id}`, height: 1040 },
    {
      name: 'fields',
      path: (c) => `/collections/${c.seeded.decade.id}`,
      act: (p) => p.getByRole('combobox', { name: 'Condition 1: field' }).click(),
    },
    {
      name: 'delete',
      path: '/collections',
      act: (p) => p.getByRole('button', { name: 'Delete Blender picks' }).click(),
      crop: (p) => p.getByRole('alertdialog'),
    },
  ],
} satisfies Area
