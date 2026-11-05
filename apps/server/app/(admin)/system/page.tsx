// SPDX-License-Identifier: AGPL-3.0-only

import { System } from '@highsea-tv/admin/system.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'System' }

export default function SystemPage() {
  return <System tab="status" />
}
