// SPDX-License-Identifier: AGPL-3.0-only
// Shows' Unmatched (shows.md#unmatched, Phase 5 B): what the import and the scan couldn't place.

import { ShowsLibrary } from '@highsea-tv/admin/shows-library.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Unmatched shows' }

export default function ShowsUnmatchedPage() {
  return <ShowsLibrary tab="unmatched" />
}
