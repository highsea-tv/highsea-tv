// SPDX-License-Identifier: AGPL-3.0-only
// The drafted routes (one-client-platform-b.md › B3, the owner's answer 1): shows, music,
// playlists and profiles are declared in the contract so the SDK and the prototypes' mock answer
// them, but this server doesn't have them yet. Each is registered here, so it's in the OpenAPI
// document with its `x-highsea-draft` mark, the guard still answers it first (signed out is 401),
// and then it answers 501 Not Implemented, the server lacking what's needed (RFC 9110 § 15.6.2),
// in the usual error body. An episode's address on the films' routes (`/items/episode/…`) answers
// the same. The apps never call these here: public info's `sources` doesn't list shows, music or
// profiles, so they hide everything of theirs.
import { DRAFT_REASON, ITEMS, isDraft, routes } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import type { OpenAPIHono, RouteConfig } from '@hono/zod-openapi'
import type { Env } from './guard.ts'

/** A drafted route's answer: 501, with `unavailable` as the body's code and why in its details. */
export class NotServed extends AppError {
  constructor() {
    super('unavailable', 'This server doesn’t serve that yet.', { reason: DRAFT_REASON })
  }
  override get status() {
    return 501
  }
}

/** Every drafted route in the contract. */
export const draftRoutes = () =>
  Object.values(routes).flatMap((group) =>
    Object.values(group as Record<string, RouteConfig>).filter((r) => isDraft(r)),
  )

export function registerDrafts(app: OpenAPIHono<Env>) {
  // before the films' routes: an episode's address is the films' with another type
  app.use(`${ITEMS}/episode/*`, () => {
    throw new NotServed()
  })
  for (const route of draftRoutes())
    app.openapi(route, () => {
      throw new NotServed()
    })
}
