// SPDX-License-Identifier: AGPL-3.0-only

import { Wanted } from '@highsea-tv/admin/wanted.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Wanted' }

export default function WantedPage() {
  return <Wanted tab="missing" />
}
