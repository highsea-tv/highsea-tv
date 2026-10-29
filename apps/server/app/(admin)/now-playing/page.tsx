// SPDX-License-Identifier: AGPL-3.0-only
// The owner's and admins' (the plan's decision 6), as every admin page.
import type { Metadata } from 'next'
import { NowPlayingPage } from '../../../src/admin/now-playing.tsx'

export const metadata: Metadata = { title: 'Now playing' }

export default function NowPlaying() {
  return <NowPlayingPage />
}
