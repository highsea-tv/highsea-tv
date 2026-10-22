// SPDX-License-Identifier: AGPL-3.0-only
// The featured-section composer; `new` adds one.
import type { Metadata } from 'next'
import { SectionEditor } from '../../../../../src/admin/curation-section.tsx'

export const metadata: Metadata = { title: 'Featured section' }

export default async function SectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SectionEditor id={id} />
}
