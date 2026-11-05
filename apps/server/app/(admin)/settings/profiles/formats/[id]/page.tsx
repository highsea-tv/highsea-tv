// SPDX-License-Identifier: AGPL-3.0-only
// A custom format's editor, or a new one at `new` (checkpoint 8c).

import { FormatEditor } from '@highsea-tv/admin/quality-editors.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Custom format' }

export default async function FormatEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FormatEditor id={id} />
}
