// SPDX-License-Identifier: AGPL-3.0-only
// An in-memory ProviderStore for the adapters' tests, with what it was asked to keep on show.
import type { Clock } from '@highsea-tv/core'
import { createFakeClock } from '@highsea-tv/core'
import type { ProviderDeps, ProviderStore, ProviderToken } from '../../src/shared/types.ts'
import { createFakeSubtitles, FAKE_ACCOUNTS } from '../fake/index.ts'

export type MemoryStore = ProviderStore & {
  creds: Record<string, string> | null
  saved: ProviderToken | null
  quota: { remaining: number | null; limit: number | null; resetsAt: number | null } | null
  links: Map<string, { link: string; expiresAt: number }>
  /** Every call that changed something, in order: `saveLink`, `dropLink`, `saveToken`… */
  log: string[]
}

export function memoryStore(clock: Clock, creds: Record<string, string> | null): MemoryStore {
  const store: MemoryStore = {
    creds,
    saved: null,
    quota: null,
    links: new Map(),
    log: [],
    credentials: () => store.creds,
    token: () => store.saved,
    saveToken(token) {
      store.log.push('saveToken')
      store.saved = token
    },
    saveQuota(quota) {
      store.log.push('saveQuota')
      store.quota = quota
    },
    link(key) {
      const l = store.links.get(key)
      return l && l.expiresAt > clock.now() ? l.link : null
    },
    saveLink(key, link, expiresAt) {
      store.log.push(`saveLink ${key}`)
      store.links.set(key, { link, expiresAt })
    },
    dropLink(key) {
      store.log.push(`dropLink ${key}`)
      store.links.delete(key)
    },
  }
  return store
}

/** A fake, a fake clock and a store holding the provider's fake account. */
export function setup(
  provider: keyof typeof FAKE_ACCOUNTS,
  options: Parameters<typeof createFakeSubtitles>[0] = {},
) {
  const clock = createFakeClock()
  const fake = createFakeSubtitles({ clock, ...options })
  const store = memoryStore(clock, { ...FAKE_ACCOUNTS[provider] })
  const deps: ProviderDeps = { fetch: fake.fetch, clock, userAgent: 'highsea v0.0.0', store }
  return { clock, fake, store, deps }
}
