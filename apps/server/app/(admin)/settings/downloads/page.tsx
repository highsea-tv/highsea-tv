// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client: the owner's only (ADR 0032's answers), so an admin finds nothing here.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DownloadClient } from '../../../../src/admin/download-client.tsx'
import { currentSession } from '../../../../src/admin/session.ts'
import { seesArea } from '../../../../src/admin/settings-areas.ts'

export const metadata: Metadata = { title: 'Download client' }

export default async function DownloadClientPage() {
  // the layout has already let only the owner and admins through
  const session = await currentSession()
  if (!session || !seesArea('downloads', session.role)) notFound()
  return <DownloadClient />
}
