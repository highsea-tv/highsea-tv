// SPDX-License-Identifier: AGPL-3.0-only
// Where a TV's code is approved (connectivity.md § Pairing): the URL and QR code the TV shows.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Pair } from '../../src/admin/links.tsx'
import { currentSession, setupComplete } from '../../src/admin/session.ts'

export const metadata: Metadata = { title: 'Connect a device' }
export const dynamic = 'force-dynamic'

export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>
}) {
  if (!setupComplete()) redirect('/setup')
  const { code } = await searchParams
  const value = Array.isArray(code) ? code[0] : code
  if (!(await currentSession()))
    redirect(`/login?next=${encodeURIComponent(value ? `/link?code=${value}` : '/link')}`)
  return <Pair code={value} />
}
