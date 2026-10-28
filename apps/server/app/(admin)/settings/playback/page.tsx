// SPDX-License-Identifier: AGPL-3.0-only
// The owner's and admins' (the 4.0b scope's answer 6), as every admin page.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PlaybackSettingsPage } from '../../../../src/admin/playback.tsx'
import { currentSession } from '../../../../src/admin/session.ts'
import { seesArea } from '../../../../src/admin/settings-areas.ts'

export const metadata: Metadata = { title: 'Playback' }

export default async function PlaybackPage() {
  const session = await currentSession()
  if (!session || !seesArea('playback', session.role)) notFound()
  return <PlaybackSettingsPage />
}
