// SPDX-License-Identifier: AGPL-3.0-only

import { General } from '@highsea-tv/admin/general.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'General' }

export default function GeneralPage() {
  return <General />
}
