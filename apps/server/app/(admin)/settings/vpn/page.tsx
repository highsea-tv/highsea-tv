// SPDX-License-Identifier: AGPL-3.0-only
// Settings › VPN: the owner's only (ADR 0032's answers), so an admin finds nothing here.

import { seesArea } from '@highsea-tv/admin/settings-areas.ts'
import { Vpn } from '@highsea-tv/admin/vpn.tsx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentSession } from '../../../../src/admin/session.ts'

export const metadata: Metadata = { title: 'VPN' }

export default async function VpnPage() {
  // the layout has already let only the owner and admins through
  const session = await currentSession()
  if (!session || !seesArea('vpn', session.role)) notFound()
  return <Vpn />
}
