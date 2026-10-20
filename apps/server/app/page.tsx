// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { DashboardPlaceholder } from '../src/admin/dashboard.tsx'
import { AdminShell } from '../src/admin/shell.tsx'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return (
    <AdminShell title="Dashboard">
      <DashboardPlaceholder />
    </AdminShell>
  )
}
