// SPDX-License-Identifier: AGPL-3.0-only
// What the personalization services share: the platform they were given.
import type { Clock, EventBus } from '@highsea-tv/core'
import type { Db } from '@highsea-tv/db'

export type PersonalizationDeps = {
  db: Db
  clock: Clock
  events: EventBus
  /** The server's name and renaming it: the runtime keeps them in the identity row. */
  serverName: () => string
  rename: (name: string) => void
}

export type Ctx = PersonalizationDeps
