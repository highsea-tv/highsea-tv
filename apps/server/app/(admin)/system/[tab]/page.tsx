// SPDX-License-Identifier: AGPL-3.0-only
// System's other tabs, each at its own address as the prototype has them; Status is also `/system`.
// Backups are the owner's (ADR 0032): an admin gets not found, as Settings' owner-only areas do.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentSession } from '../../../../src/admin/session.ts'
import { System, type SystemTab } from '../../../../src/admin/system.tsx'

// here, not in the client module: a server component gets only a reference to a client module's values
const TABS: SystemTab[] = ['status', 'health', 'tasks', 'logs', 'events', 'backups', 'updates']

export const metadata: Metadata = { title: 'System' }

export default async function SystemTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params
  if (!TABS.includes(tab as SystemTab)) notFound()
  if (tab === 'backups') {
    const session = await currentSession()
    if (session?.role !== 'owner') notFound()
  }
  return <System tab={tab as SystemTab} />
}
