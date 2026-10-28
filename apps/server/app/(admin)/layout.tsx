// SPDX-License-Identifier: AGPL-3.0-only
// The gate in front of every admin page: setup first, then a signed-in person, then staff. A user
// is sent to the web app at every admin address, with nothing of the admin loaded (ADR 0032's
// 4.2a section).
// Server components only redirect here (ADR 0018); the shell and its data are client components
// on the API.
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { currentSession, setupComplete } from '../../src/admin/session.ts'
import { AdminShell } from '../../src/admin/shell.tsx'
import { PATH_HEADER } from '../../src/session-cookie.ts'

// who's signed in is read per request
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!setupComplete()) redirect('/setup')
  const session = await currentSession()
  if (!session) {
    // back to the page they asked for once they've signed in
    const path = (await headers()).get(PATH_HEADER)
    redirect(path && path !== '/' ? `/login?next=${encodeURIComponent(path)}` : '/login')
  }
  if (session.role === 'user') redirect('/web/')
  return <AdminShell role={session.role}>{children}</AdminShell>
}
