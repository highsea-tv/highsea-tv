// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Network } from '../../../../src/admin/network.tsx'
import { currentSession } from '../../../../src/admin/session.ts'
import { seesArea } from '../../../../src/admin/settings-areas.ts'

export const metadata: Metadata = { title: 'Network and remote access' }

export default async function NetworkPage() {
  const session = await currentSession()
  if (!session || !seesArea('network', session.role)) notFound()
  return <Network />
}
