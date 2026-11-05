// SPDX-License-Identifier: AGPL-3.0-only
// Activity's other tabs, each at its own address (admin-shell.md › Interactions); the first is `/activity`.

import { Activity, type ActivityTab } from '@highsea-tv/admin/activity.tsx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

// here, not in the client module: a server component gets only a reference to a client module's values
const TABS: ActivityTab[] = ['history', 'blocklist']

export const metadata: Metadata = { title: 'Activity' }

export default async function ActivityTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params
  if (!TABS.includes(tab as ActivityTab)) notFound()
  return <Activity tab={tab as ActivityTab} />
}
