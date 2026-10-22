// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Connections (checkpoint 8b): the owner's and admins' (ADR 0032).
import type { Metadata } from 'next'
import { Connections } from '../../../../src/admin/connections.tsx'

export const metadata: Metadata = { title: 'Connections' }

export default function ConnectionsPage() {
  return <Connections />
}
