// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { SettingsIndex } from '../../../src/admin/settings.tsx'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
  return <SettingsIndex />
}
