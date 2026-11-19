// SPDX-License-Identifier: AGPL-3.0-only
// Music in the admin (music.md), served since HT-101: Artists, Music's first page; drawn only when
// the server lists `music`.

import { MusicLibrary } from '@highsea-tv/admin/music-library.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Music' }

export default function MusicPage() {
  return <MusicLibrary />
}
