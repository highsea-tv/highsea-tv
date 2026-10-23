// SPDX-License-Identifier: AGPL-3.0-only
// The owner's only (ADR 0032): an admin gets not found.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackupsSettings } from '../../../../src/admin/backups.tsx'
import { currentSession } from '../../../../src/admin/session.ts'
import { seesArea } from '../../../../src/admin/settings-areas.ts'

export const metadata: Metadata = { title: 'Backups' }

export default async function BackupsPage() {
  const session = await currentSession()
  if (!session || !seesArea('backups', session.role)) notFound()
  return <BackupsSettings />
}
