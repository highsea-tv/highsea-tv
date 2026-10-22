// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Collections } from '../../../src/admin/collections.tsx'

export const metadata: Metadata = { title: 'Collections' }

export default function CollectionsPage() {
  return <Collections />
}
