// SPDX-License-Identifier: AGPL-3.0-only
// A show's other tab at its own address (admin-shell.md › Interactions): Files. Episodes is
// `/shows/{id}`; any other tab draws not found.

import { ShowDetail } from '@highsea-tv/admin/show-detail.tsx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Show' }

export default async function ShowTabPage({
  params,
}: {
  params: Promise<{ id: string; tab: string }>
}) {
  const { id, tab } = await params
  if (tab !== 'files') notFound()
  return <ShowDetail id={id} tab="files" />
}
