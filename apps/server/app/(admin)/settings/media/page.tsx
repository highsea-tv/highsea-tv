// SPDX-License-Identifier: AGPL-3.0-only

import { MediaManagement } from '@highsea-tv/admin/media-management.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Media management' }

export default function MediaManagementPage() {
  return <MediaManagement />
}
