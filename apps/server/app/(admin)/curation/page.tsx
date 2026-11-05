// SPDX-License-Identifier: AGPL-3.0-only

import { Curation } from '@highsea-tv/admin/curation.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Curation' }

export default function CurationPage() {
  return <Curation tab="announcements" />
}
