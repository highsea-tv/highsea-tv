// SPDX-License-Identifier: AGPL-3.0-only
// An album's page by its id in the library (music.md#an-album, HT-101): Tracks.

import { AlbumDetail } from '@highsea-tv/admin/music-detail.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Album' }

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AlbumDetail id={id} />
}
