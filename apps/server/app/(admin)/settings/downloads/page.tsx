// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client: the owner's only (ADR 0032's answers), so an admin finds nothing here.

import { DownloadClient } from '@highsea-tv/admin/download-client.tsx'
import { seesArea } from '@highsea-tv/admin/settings-areas.ts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentSession } from '../../../../src/admin/session.ts'

export const metadata: Metadata = { title: 'Download client' }

export default async function DownloadClientPage() {
  // the layout has already let only the owner and admins through
  const session = await currentSession()
  if (!session || !seesArea('downloads', session.role)) notFound()
  return <DownloadClient />
}
