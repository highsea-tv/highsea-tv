// SPDX-License-Identifier: AGPL-3.0-only

import { Activity } from '@highsea-tv/admin/activity.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Activity' }

export default function ActivityPage() {
  return <Activity />
}
