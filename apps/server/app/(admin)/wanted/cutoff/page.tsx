// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Wanted } from '../../../../src/admin/wanted.tsx'

export const metadata: Metadata = { title: 'Cutoff unmet' }

export default function WantedCutoffPage() {
  return <Wanted tab="cutoff" />
}
