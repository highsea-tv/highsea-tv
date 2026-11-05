// SPDX-License-Identifier: AGPL-3.0-only

import { SettingsIndex } from '@highsea-tv/admin/settings.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
  return <SettingsIndex />
}
