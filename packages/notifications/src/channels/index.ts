// SPDX-License-Identifier: AGPL-3.0-only
// The connection kinds (checkpoint 8b, ADR 0046): one channel each, by kind.
import type { ConnectionKind } from '../shared/index.ts'
import { browser } from './browser.ts'
import type { Channel } from './channel.ts'
import { email } from './email.ts'
import {
  apprise,
  discord,
  gotify,
  matrix,
  ntfy,
  pushover,
  slack,
  telegram,
  webhook,
} from './http.ts'

export * from './browser.ts'
export * from './channel.ts'
export * from './email.ts'
export * from './http.ts'

// biome-ignore lint/suspicious/noExplicitAny: each kind has its own settings
export const CHANNELS: Record<ConnectionKind, Channel<any>> = {
  discord,
  slack,
  telegram,
  ntfy,
  gotify,
  pushover,
  matrix,
  email,
  webhook,
  apprise,
  browser,
}
