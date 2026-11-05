// SPDX-License-Identifier: AGPL-3.0-only

import { Subtitles } from '@highsea-tv/admin/subtitles.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Subtitles' }

export default function SubtitlesPage() {
  return <Subtitles />
}
