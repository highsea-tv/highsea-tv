// SPDX-License-Identifier: AGPL-3.0-only
// Shows in the admin (shows.md), served since Phase 5 B; drawn only when the server lists `shows`.

import { ShowsLibrary } from '@highsea-tv/admin/shows-library.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Shows' }

export default function ShowsPage() {
  return <ShowsLibrary />
}
