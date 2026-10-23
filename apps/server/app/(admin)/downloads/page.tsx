// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Downloads } from '../../../src/admin/downloads.tsx'

export const metadata: Metadata = { title: 'Downloads' }

export default function DownloadsPage() {
  return <Downloads />
}
