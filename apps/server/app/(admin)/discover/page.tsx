// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Discover } from '../../../src/admin/discover.tsx'

export const metadata: Metadata = { title: 'Discover' }

export default function DiscoverPage() {
  return <Discover />
}
