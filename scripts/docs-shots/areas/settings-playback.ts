// SPDX-License-Identifier: AGPL-3.0-only
// The Playback settings guide's screenshots (apps/docs/content/settings/playback.mdx).
import type { Area } from '../shot.ts'

export default {
  shots: [
    { name: 'overview', path: '/settings/playback' },
    {
      name: 'cache',
      path: '/settings/playback',
      crop: (p) => p.getByRole('region', { name: 'Cache' }),
    },
  ],
} satisfies Area
