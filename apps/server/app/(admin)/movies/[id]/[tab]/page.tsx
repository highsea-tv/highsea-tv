// SPDX-License-Identifier: AGPL-3.0-only
// A movie's other tabs, each at its own address (admin-shell.md › Interactions); Overview is
// `/movies/{id}`. A tab the film doesn't have (Files before it's added) draws not found there.

import { MovieDetail, type MovieTab } from '@highsea-tv/admin/movie-detail.tsx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

// here, not in the client module: a server component gets only a reference to a client module's values
const TABS: MovieTab[] = ['cast', 'files', 'history', 'search', 'subtitles']

export const metadata: Metadata = { title: 'Movie' }

export default async function MovieTabPage({
  params,
}: {
  params: Promise<{ id: string; tab: string }>
}) {
  const { id, tab } = await params
  if (!TABS.includes(tab as MovieTab)) notFound()
  return <MovieDetail id={id} tab={tab as MovieTab} />
}
