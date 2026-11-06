// SPDX-License-Identifier: AGPL-3.0-only
// What the admin's answers (one-client-platform-d.md › D2) take from the transport: the mock's
// times moved to the wall clock, as every other answer gives them, the event bus, and the
// refusals in the server's ErrorBody (packages/core's AppError).
import type { CatalogStatus, routes } from '@highsea-tv/api-contract'
import { AppError, type ErrorCode } from '@highsea-tv/core/errors'
import type { Output } from '@highsea-tv/sdk'
import type { Answers, Ctx } from '../transport.ts'
import type { User } from '../types.ts'

export type { Answers, Ctx }

export type AdminKit = {
  /** A mock time (ISO) as the wall clock's: the mock runs on its own clock from its epoch. */
  wall: (date: string) => string
  /** The same for a mock time in ms. */
  wallMs: (ms: number) => string
  /** Raises a topic on the event stream, as the server's domains raise theirs. */
  emit: (topic: string) => void
  /** A person as the API gives them (the transport's one mapper, which its session uses too). */
  userOf: (u: User) => UserOut
  /** The catalog's status, as the transport's catalog.status gives it (System › About's). */
  catalogOf: (ctx: Ctx) => CatalogStatus
  /** The server as `system.server` gives it (setup's Finish, D3). */
  serverOf: (ctx: Ctx) => unknown
  /** Signs this browser in as a person, as signing in does, and gives the session (setup's Finish). */
  signInAs: (ctx: Ctx, userId: string) => unknown
  /** Everyone's signed-in devices on this server, as me.devices maps the caller's (D3's Users). */
  devicesOf: (ctx: Ctx) => Output<(typeof routes)['devices']['list']>
  /** The appearance as `appearance.get` gives it, the toolbar's theme and sounds included (D3's Appearance). */
  appearanceOf: () => unknown
}

/** The contract's person, as the transport's mapper makes it. */
export type UserOut = {
  id: string
  username: string
  displayName: string
  role: User['role']
  permissions: User['permissions']
  libraries: User['libraries']
  twoFactor: boolean
  passkeys: number
  hasPassword: boolean
  email: string | null
  lastSeen: string | null
  invited: boolean
  createdAt: string
}

/** A refusal the server would give, with its code, words and details. */
export const refuse = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(code, message, details)
