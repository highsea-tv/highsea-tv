// SPDX-License-Identifier: AGPL-3.0-only
// Roles set the defaults; permissions fine-tune them (users-devices.md). The owner and admins are
// "staff": they run the server. Members and restricted accounts use the library.
import type { Permission, Role } from '@highsea/db/schema'

export const isStaff = (role: Role) => role === 'owner' || role === 'admin'

/** Each role's permissions until someone changes them (the prototype's defaults). */
export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: ['request', 'autoApprove', 'download', 'manageLibrary', 'manageUsers', 'admin'],
  admin: ['request', 'autoApprove', 'download', 'manageLibrary'],
  member: ['request'],
  restricted: [],
}

/** The libraries there are. TV shows, music and books join this list when the server has them. */
export const LIBRARIES = ['movies'] as const
export const ALL_LIBRARIES = '*'

/** Who may manage people: staff, or anyone given "Manage people". */
export const canManageUsers = (role: Role, permissions: readonly Permission[]) =>
  isStaff(role) || permissions.includes('manageUsers')
