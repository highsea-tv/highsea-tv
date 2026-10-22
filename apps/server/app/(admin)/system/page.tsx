// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { System } from '../../../src/admin/system.tsx'

export const metadata: Metadata = { title: 'System' }

export default function SystemPage() {
  return <System tab="status" />
}
