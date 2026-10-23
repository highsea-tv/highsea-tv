// SPDX-License-Identifier: AGPL-3.0-only
// The quality size table's editor (checkpoint 8c).
import type { Metadata } from 'next'
import { SizeEditor } from '../../../../../src/admin/quality-editors.tsx'

export const metadata: Metadata = { title: 'Edit sizes' }

export default function SizeEditorPage() {
  return <SizeEditor />
}
