// SPDX-License-Identifier: AGPL-3.0-only
// The owner's only (ADR 0032): an admin gets not found.

import { BackupsSettings } from '@highsea-tv/admin/backups.tsx'
import { seesArea } from '@highsea-tv/admin/settings-areas.ts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentSession } from '../../../../src/admin/session.ts'

export const metadata: Metadata = { title: 'Backups' }

export default async function BackupsPage() {
  const session = await currentSession()
  if (!session || !seesArea('backups', session.role)) notFound()
  return <BackupsSettings />
}
