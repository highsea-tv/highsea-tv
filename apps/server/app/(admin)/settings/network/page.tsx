// SPDX-License-Identifier: AGPL-3.0-only

import { Network } from '@highsea-tv/admin/network.tsx'
import { seesArea } from '@highsea-tv/admin/settings-areas.ts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentSession } from '../../../../src/admin/session.ts'

export const metadata: Metadata = { title: 'Network and remote access' }

export default async function NetworkPage() {
  const session = await currentSession()
  if (!session || !seesArea('network', session.role)) notFound()
  return <Network />
}
