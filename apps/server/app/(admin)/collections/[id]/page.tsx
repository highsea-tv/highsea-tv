// SPDX-License-Identifier: AGPL-3.0-only
// A collection by its id: the server's own (`sc-…`, or `new`) opens the editor (checkpoint 8d);
// a TMDB id opens TMDB's collection page (checkpoint 4 plan, judgement call 5: no `/metadata/`).
import type { Metadata } from 'next'
import { CollectionPage } from '../../../../src/admin/collection.tsx'
import { CollectionEditor } from '../../../../src/admin/collections-editor.tsx'

export const metadata: Metadata = { title: 'Collection' }

export default async function Collection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return id === 'new' || id.startsWith('sc-') ? (
    <CollectionEditor id={id} />
  ) : (
    <CollectionPage id={id} />
  )
}
