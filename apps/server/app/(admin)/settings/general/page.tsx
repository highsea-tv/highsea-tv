// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { General } from '../../../../src/admin/general.tsx'

export const metadata: Metadata = { title: 'General' }

export default function GeneralPage() {
  return <General />
}
