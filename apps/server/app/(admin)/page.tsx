// SPDX-License-Identifier: AGPL-3.0-only

import { Dashboard } from '@highsea-tv/admin/dashboard.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return <Dashboard />
}
