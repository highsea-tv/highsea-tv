// SPDX-License-Identifier: AGPL-3.0-only
// Subtitles's other tabs, each at its own address (admin-shell.md › Interactions); the first is `/subtitles`.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Subtitles, type SubtitlesTab } from '../../../../src/admin/subtitles.tsx'

// here, not in the client module: a server component gets only a reference to a client module's values
const TABS: SubtitlesTab[] = ['providers', 'languages', 'scoring']

export const metadata: Metadata = { title: 'Subtitles' }

export default async function SubtitlesTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params
  if (!TABS.includes(tab as SubtitlesTab)) notFound()
  return <Subtitles tab={tab as SubtitlesTab} />
}
