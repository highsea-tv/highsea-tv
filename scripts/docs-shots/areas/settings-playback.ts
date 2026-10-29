// SPDX-License-Identifier: AGPL-3.0-only
// The Playback settings guide's screenshots (apps/docs/content/settings/playback.mdx).
import type { Area } from '../shot.ts'

export default {
  shots: [
    { name: 'overview', path: '/settings/playback' },
    {
      name: 'hardware',
      path: '/settings/playback',
      // Taller than the window: the page scrolls in its own frame, so the crop needs it all in view.
      height: 1500,
      crop: (p) => p.getByRole('region', { name: 'Hardware acceleration' }),
    },
    {
      name: 'cache',
      path: '/settings/playback',
      crop: (p) => p.getByRole('region', { name: 'Cache' }),
    },
  ],
} satisfies Area
