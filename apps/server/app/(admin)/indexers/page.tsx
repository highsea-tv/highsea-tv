// SPDX-License-Identifier: AGPL-3.0-only

import { Indexers } from '@highsea-tv/admin/indexers.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Indexers' }

export default function IndexersPage() {
  return <Indexers />
}
