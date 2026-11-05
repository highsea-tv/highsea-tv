// SPDX-License-Identifier: AGPL-3.0-only
// Now playing's other tabs, each at its own address (admin-shell.md › Interactions); the first is `/now-playing`.

import { NowPlayingPage, type NowPlayingTab } from '@highsea-tv/admin/now-playing.tsx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

// here, not in the client module: a server component gets only a reference to a client module's values
const TABS: NowPlayingTab[] = ['history']

export const metadata: Metadata = { title: 'Now playing' }

export default async function NowPlayingPageTabPage({
  params,
}: {
  params: Promise<{ tab: string }>
}) {
  const { tab } = await params
  if (!TABS.includes(tab as NowPlayingTab)) notFound()
  return <NowPlayingPage tab={tab as NowPlayingTab} />
}
