// SPDX-License-Identifier: AGPL-3.0-only
// A quality profile's editor, or a new one at `new` (checkpoint 8c).
import type { Metadata } from 'next'
import { ProfileEditor } from '../../../../../src/admin/quality-editors.tsx'

export const metadata: Metadata = { title: 'Quality profile' }

export default async function ProfileEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProfileEditor id={id} />
}
