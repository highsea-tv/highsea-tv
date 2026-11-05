// SPDX-License-Identifier: AGPL-3.0-only

import { Curation } from '@highsea-tv/admin/curation.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Featured sections' }

export default function FeaturedPage() {
  return <Curation tab="featured" />
}
