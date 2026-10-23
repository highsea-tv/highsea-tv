// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Indexers } from '../../../src/admin/indexers.tsx'

export const metadata: Metadata = { title: 'Indexers' }

export default function IndexersPage() {
  return <Indexers />
}
