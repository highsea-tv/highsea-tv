// SPDX-License-Identifier: AGPL-3.0-only
// A collection's page by TMDB id (checkpoint 4 plan, judgement call 5: no `/metadata/`).
import type { Metadata } from 'next'
import { CollectionPage } from '../../../../src/admin/collection.tsx'

export const metadata: Metadata = { title: 'Collection' }

export default async function Collection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CollectionPage id={id} />
}
