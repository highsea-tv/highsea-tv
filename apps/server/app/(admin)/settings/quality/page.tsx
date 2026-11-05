// SPDX-License-Identifier: AGPL-3.0-only

import { QualitySizes } from '@highsea-tv/admin/profiles.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Quality sizes' }

export default function QualitySizesPage() {
  return <QualitySizes />
}
