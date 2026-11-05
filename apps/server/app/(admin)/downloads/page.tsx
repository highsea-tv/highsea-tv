// SPDX-License-Identifier: AGPL-3.0-only

import { Downloads } from '@highsea-tv/admin/downloads.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Downloads' }

export default function DownloadsPage() {
  return <Downloads />
}
