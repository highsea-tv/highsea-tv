// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Import lists (checkpoint 8a): the owner's and admins' (ADR 0032).
import type { Metadata } from 'next'
import { ImportLists } from '../../../../src/admin/lists.tsx'

export const metadata: Metadata = { title: 'Import lists' }

export default function ImportListsPage() {
  return <ImportLists />
}
