// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Subtitles } from '../../../src/admin/subtitles.tsx'

export const metadata: Metadata = { title: 'Subtitles' }

export default function SubtitlesPage() {
  return <Subtitles />
}
