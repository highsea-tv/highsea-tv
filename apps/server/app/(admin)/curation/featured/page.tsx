// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Curation } from '../../../../src/admin/curation.tsx'

export const metadata: Metadata = { title: 'Featured sections' }

export default function FeaturedPage() {
  return <Curation tab="featured" />
}
