// SPDX-License-Identifier: AGPL-3.0-only
// Music's Albums (music.md#albums, HT-101).

import { MusicLibrary } from '@highsea-tv/admin/music-library.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Albums' }

export default function MusicAlbumsPage() {
  return <MusicLibrary tab="albums" />
}
