// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { MoviesLibrary } from '../../../src/admin/library.tsx'

export const metadata: Metadata = { title: 'Movies' }

export default function MoviesPage() {
  return <MoviesLibrary />
}
