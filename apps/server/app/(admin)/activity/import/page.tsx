// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { ManualImport } from '../../../../src/admin/import.tsx'

export const metadata: Metadata = { title: 'Manual import' }

export default function ManualImportPage() {
  return <ManualImport />
}
