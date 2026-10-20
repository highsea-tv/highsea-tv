// SPDX-License-Identifier: AGPL-3.0-only
// The public API's contract (ADR 0006): every route's method, path, inputs and responses, as zod
// schemas with OpenAPI metadata. The server implements these routes; the SDK calls them; the
// OpenAPI document is generated from them. The prototype's draft types
// (design/prototypes/src/mock/types.ts) move here a route group at a time.
export * from './common.ts'
export * from './events.ts'
export * from './system.ts'

import { system } from './system.ts'

/** Every route, by group. The SDK builds its methods from this. */
export const routes = { system } as const
