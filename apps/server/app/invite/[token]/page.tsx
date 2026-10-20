// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { AccountLinkPage } from '../../../src/admin/links.tsx'

export const metadata: Metadata = { title: 'Join', referrer: 'no-referrer' }

// the token is a secret: no-referrer keeps it out of other sites' logs (OWASP Forgot Password
// Cheat Sheet, "Referrer-Policy")
export default async function LinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <AccountLinkPage token={token} />
}
