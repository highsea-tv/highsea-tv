// SPDX-License-Identifier: AGPL-3.0-only
// An artist's page by their id in the library (music.md#an-artist, HT-101).

import { ArtistDetail } from '@highsea-tv/admin/music-detail.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Artist' }

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ArtistDetail id={id} />
}
