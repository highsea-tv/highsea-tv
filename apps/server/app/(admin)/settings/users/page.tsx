// SPDX-License-Identifier: AGPL-3.0-only

import { Users } from '@highsea-tv/admin/users.tsx'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Users and devices' }

export default function UsersPage() {
  return <Users />
}
