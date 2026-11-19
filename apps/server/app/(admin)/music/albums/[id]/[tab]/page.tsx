// SPDX-License-Identifier: AGPL-3.0-only
// An album's other tab at its own address (admin-shell.md › Interactions): Files. Tracks is
// `/music/albums/{id}`; any other tab draws not found.

import { AlbumDetail } from '@highsea-tv/admin/music-detail.tsx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Album' }

export default async function AlbumTabPage({
  params,
}: {
  params: Promise<{ id: string; tab: string }>
}) {
  const { id, tab } = await params
  if (tab !== 'files') notFound()
  return <AlbumDetail id={id} tab="files" />
}
