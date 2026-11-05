// SPDX-License-Identifier: AGPL-3.0-only

import { Profiles } from '@highsea-tv/admin/profiles.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Profiles and formats' }

export default function ProfilesPage() {
  return <Profiles />
}
