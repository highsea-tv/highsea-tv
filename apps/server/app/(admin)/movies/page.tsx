// SPDX-License-Identifier: AGPL-3.0-only

import { MoviesLibrary } from '@highsea-tv/admin/library.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Movies' }

export default function MoviesPage() {
  return <MoviesLibrary />
}
