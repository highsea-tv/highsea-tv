// SPDX-License-Identifier: AGPL-3.0-only
// The owner's and admins' (the plan's decision 6), as every admin page.

import { NowPlayingPage } from '@highsea-tv/admin/now-playing.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Now playing' }

export default function NowPlaying() {
  return <NowPlayingPage />
}
