// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { MediaManagement } from '../../../../src/admin/media-management.tsx'

export const metadata: Metadata = { title: 'Media management' }

export default function MediaManagementPage() {
  return <MediaManagement />
}
