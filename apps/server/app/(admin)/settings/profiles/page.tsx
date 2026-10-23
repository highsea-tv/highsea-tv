// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Profiles } from '../../../../src/admin/profiles.tsx'

export const metadata: Metadata = { title: 'Profiles and formats' }

export default function ProfilesPage() {
  return <Profiles />
}
