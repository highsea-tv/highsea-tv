// SPDX-License-Identifier: AGPL-3.0-only

import { Collections } from '@highsea-tv/admin/collections.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Collections' }

export default function CollectionsPage() {
  return <Collections />
}
