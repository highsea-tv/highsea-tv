// SPDX-License-Identifier: AGPL-3.0-only
// A show's page by its TMDB id (ADR 0064), in the library or not.

import { ShowDetail } from '@highsea-tv/admin/show-detail.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Show' }

export default async function ShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ShowDetail id={id} />
}
