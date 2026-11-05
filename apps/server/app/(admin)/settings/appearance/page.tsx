// SPDX-License-Identifier: AGPL-3.0-only

import { Appearance } from '@highsea-tv/admin/appearance.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Appearance' }

export default function AppearancePage() {
  return <Appearance />
}
