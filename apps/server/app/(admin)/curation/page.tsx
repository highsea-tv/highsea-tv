// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Curation } from '../../../src/admin/curation.tsx'

export const metadata: Metadata = { title: 'Curation' }

export default function CurationPage() {
  return <Curation tab="announcements" />
}
