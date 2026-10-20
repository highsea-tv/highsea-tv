// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { setupComplete } from '../../src/admin/session.ts'
import { Setup } from '../../src/admin/setup.tsx'

export const metadata: Metadata = { title: 'Set up highsea' }
export const dynamic = 'force-dynamic'

export default function SetupPage() {
  // setup runs once: after it, the API refuses it too
  if (setupComplete()) redirect('/')
  return <Setup />
}
