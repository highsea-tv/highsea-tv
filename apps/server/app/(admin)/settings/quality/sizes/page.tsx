// SPDX-License-Identifier: AGPL-3.0-only
// The quality size table's editor (checkpoint 8c).

import { SizeEditor } from '@highsea-tv/admin/quality-editors.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Edit sizes' }

export default function SizeEditorPage() {
  return <SizeEditor />
}
