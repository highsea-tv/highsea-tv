// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Appearance } from '../../../../src/admin/appearance.tsx'

export const metadata: Metadata = { title: 'Appearance' }

export default function AppearancePage() {
  return <Appearance />
}
