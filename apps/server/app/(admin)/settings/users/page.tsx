// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next'
import { Users } from '../../../../src/admin/users.tsx'

export const metadata: Metadata = { title: 'Users and devices' }

export default function UsersPage() {
  return <Users />
}
