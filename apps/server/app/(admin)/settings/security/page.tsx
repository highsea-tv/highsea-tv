// SPDX-License-Identifier: AGPL-3.0-only
// The owner's only (ADR 0032): an admin gets not found.

import { Security } from '@highsea-tv/admin/security.tsx'
import { seesArea } from '@highsea-tv/admin/settings-areas.ts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentSession } from '../../../../src/admin/session.ts'

export const metadata: Metadata = { title: 'Security' }

export default async function SecurityPage() {
  const session = await currentSession()
  if (!session || !seesArea('security', session.role)) notFound()
  return <Security />
}
