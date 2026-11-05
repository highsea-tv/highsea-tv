// SPDX-License-Identifier: AGPL-3.0-only

import { Wanted } from '@highsea-tv/admin/wanted.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Calendar' }

export default function WantedCalendarPage() {
  return <Wanted tab="calendar" />
}
