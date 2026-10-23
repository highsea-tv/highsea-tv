// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Migration: the one-time importers, the owner's only (the owner's answer 10), so an
// admin finds nothing here.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Migration } from '../../../../src/admin/migration.tsx'
import { currentSession } from '../../../../src/admin/session.ts'
import { seesArea } from '../../../../src/admin/settings-areas.ts'

export const metadata: Metadata = { title: 'Migration' }

export default async function MigrationPage() {
  // the layout has already let only the owner and admins through
  const session = await currentSession()
  if (!session || !seesArea('migration', session.role)) notFound()
  return <Migration />
}
