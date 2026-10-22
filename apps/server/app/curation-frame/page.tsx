// SPDX-License-Identifier: AGPL-3.0-only
// The client preview's frame (A11; checkpoint 8c): a home screen drawn from what the admin posts
// to it, outside the admin's shell so it takes the app's width. Staff only, as the admin is
// (ADR 0032); it fetches nothing of its own.
import type { Metadata } from 'next'
import { PreviewFrame } from '../../src/admin/curation-frame.tsx'
import { currentSession } from '../../src/admin/session.ts'

export const metadata: Metadata = { title: 'Preview' }

// who's signed in is read per request
export const dynamic = 'force-dynamic'

export default async function CurationFrame() {
  const session = await currentSession()
  if (!session || session.role === 'user') return null
  return <PreviewFrame />
}
