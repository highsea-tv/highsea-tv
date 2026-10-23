// SPDX-License-Identifier: AGPL-3.0-only
// Two kinds of access (ADR 0032): the owner and admins are "staff" and run the server, by their
// role alone; users watch, with "Ask for titles" and "Download for offline" set per person.
import type { Permission, Role } from '@highsea-tv/db/schema'

export const isStaff = (role: Role) => role === 'owner' || role === 'admin'

/** Each role's permission rows when the account is made. Staff need none. */
export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: [],
  admin: [],
  user: ['request'],
}

/** The libraries there are. TV shows, music and books join this list when the server has them. */
export const LIBRARIES = ['movies'] as const
export const ALL_LIBRARIES = '*'

/** Inviting and managing people is the owner's alone (ADR 0032). */
export const canManageUsers = (role: Role) => role === 'owner'

/** What someone may do as a viewer: staff always, a user as given. */
export const may = (role: Role, permissions: readonly Permission[], permission: Permission) =>
  isStaff(role) || permissions.includes(permission)
