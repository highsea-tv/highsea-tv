// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { QualitySizes } from '../../../../src/admin/profiles.tsx'

export const metadata: Metadata = { title: 'Quality sizes' }

export default function QualitySizesPage() {
  return <QualitySizes />
}
