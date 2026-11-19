// SPDX-License-Identifier: AGPL-3.0-only
// Music's Unmatched (music.md#unmatched, HT-101): the folders the scan couldn't read as an album.

import { MusicLibrary } from '@highsea-tv/admin/music-library.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Unmatched music' }

export default function MusicUnmatchedPage() {
  return <MusicLibrary tab="unmatched" />
}
