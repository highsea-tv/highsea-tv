// SPDX-License-Identifier: AGPL-3.0-only
// Indexers's other tabs, each at its own address (admin-shell.md › Interactions); the first is `/indexers`.

import { Indexers, type IndexersTab } from '@highsea-tv/admin/indexers.tsx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

// here, not in the client module: a server component gets only a reference to a client module's values
const TABS: IndexersTab[] = ['catalog']

export const metadata: Metadata = { title: 'Indexers' }

export default async function IndexersTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params
  if (!TABS.includes(tab as IndexersTab)) notFound()
  return <Indexers tab={tab as IndexersTab} />
}
