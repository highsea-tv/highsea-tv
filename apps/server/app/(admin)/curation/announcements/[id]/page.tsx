// SPDX-License-Identifier: AGPL-3.0-only
// The announcement composer; `new` writes one.

import { AnnouncementEditor } from '@highsea-tv/admin/curation-announcement.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Announcement' }

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AnnouncementEditor id={id} />
}
