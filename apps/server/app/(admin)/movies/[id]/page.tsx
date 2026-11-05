// SPDX-License-Identifier: AGPL-3.0-only
// A6, a movie's page by TMDB id, in the library or not (ADR 0014, amended 2026-10-20).

import { MovieDetail } from '@highsea-tv/admin/movie-detail.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Movie' }

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <MovieDetail id={id} />
}
