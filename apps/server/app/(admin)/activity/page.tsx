// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Activity } from '../../../src/admin/activity.tsx'

export const metadata: Metadata = { title: 'Activity' }

export default function ActivityPage() {
  return <Activity />
}
