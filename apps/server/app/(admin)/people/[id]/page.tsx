// SPDX-License-Identifier: AGPL-3.0-only
// A person's page by TMDB id (media-pages.md § Person page).

import { PersonPage } from '@highsea-tv/admin/person.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Person' }

export default async function Person({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PersonPage id={id} />
}
