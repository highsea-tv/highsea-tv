// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Dashboard } from '../../src/admin/dashboard.tsx'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return <Dashboard />
}
