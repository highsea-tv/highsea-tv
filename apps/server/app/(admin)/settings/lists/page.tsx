// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Import lists (checkpoint 8a): the owner's and admins' (ADR 0032).

import { ImportLists } from '@highsea-tv/admin/lists.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Import lists' }

export default function ImportListsPage() {
  return <ImportLists />
}
