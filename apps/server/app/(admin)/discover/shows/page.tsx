// SPDX-License-Identifier: AGPL-3.0-only
// Discover's Shows (shows.md › Add a show), served since Phase 5 B.

import { DiscoverShows } from '@highsea-tv/admin/discover-shows.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Discover' }

export default function DiscoverShowsPage() {
  return <DiscoverShows />
}
