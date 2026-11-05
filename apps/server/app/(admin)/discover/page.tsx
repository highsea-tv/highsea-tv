// SPDX-License-Identifier: AGPL-3.0-only

import { Discover } from '@highsea-tv/admin/discover.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Discover' }

export default function DiscoverPage() {
  return <Discover />
}
