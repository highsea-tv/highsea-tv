// SPDX-License-Identifier: AGPL-3.0-only

import { Login } from '@highsea-tv/admin/login.tsx'
import { safeNext } from '@highsea-tv/admin/next-path.ts'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentSession, setupComplete } from '../../src/admin/session.ts'

export const metadata: Metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

type Search = Promise<{ next?: string | string[]; error?: string | string[] }>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  if (!setupComplete()) redirect('/setup')
  const { next, error } = await searchParams
  if (await currentSession()) redirect(safeNext(one(next)))
  return <Login next={one(next)} oidcError={one(error)} />
}
