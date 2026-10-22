// SPDX-License-Identifier: AGPL-3.0-only
// The announcement composer; `new` writes one.
import type { Metadata } from 'next'
import { AnnouncementEditor } from '../../../../../src/admin/curation-announcement.tsx'

export const metadata: Metadata = { title: 'Announcement' }

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AnnouncementEditor id={id} />
}
