// SPDX-License-Identifier: AGPL-3.0-only
// A17. `?path=` opens it on a folder and looks inside: Downloads' Import into the library (6b).
import type { Metadata } from 'next'
import { ManualImport } from '../../../../src/admin/import.tsx'
import { LibraryImport } from '../../../../src/admin/library-import.tsx'

export const metadata: Metadata = { title: 'Manual import' }

/**
 * A17's two modes: files (`/activity/import`, or `?path=…` to open on a folder) and a library on
 * disk (`?mode=library&root=…`).
 */
export default async function ManualImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string | string[]
    root?: string | string[]
    path?: string | string[]
  }>
}) {
  const { mode, root, path } = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  if (one(mode) === 'library') return <LibraryImport root={one(root) ?? ''} />
  return <ManualImport initialPath={one(path)} />
}
