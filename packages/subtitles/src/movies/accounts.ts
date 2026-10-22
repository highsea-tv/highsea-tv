// SPDX-License-Identifier: AGPL-3.0-only
// The providers as A10 shows them, and every call to one (ADR 0043). Each provider has a row in
// `subtitle_providers`: on or off, its account sealed like indexer secrets, its token, its throttle
// and its count for today. `call` is the only way to reach a provider: it skips one that's waiting,
// counts requests for those that don't report their own quota, and turns a failure into a throttle.
// The account's secrets are never returned; the Edit dialog leaves a secret blank to keep it.
import { AppError, type Clock, type Fetch, type Logger, type Sealer } from '@highsea-tv/core'
import type { Db } from '@highsea-tv/db'
import { subtitleDownloads, subtitleProviders } from '@highsea-tv/db/schema'
import { eq, lt } from 'drizzle-orm'
import { createProvider, PROVIDER_INFO, PROVIDER_ORDER } from '../providers/index.ts'
import {
  afterFailure,
  afterSuccess,
  nextUtcMidnight,
  type ThrottleReason,
  type ThrottleState,
  throttled,
} from '../shared/throttle.ts'
import {
  type Provider,
  type ProviderAccount,
  ProviderError,
  type ProviderId,
  type ProviderStore,
  type ProviderToken,
} from '../shared/types.ts'

export type AccountsDeps = {
  db: Db
  clock: Clock
  logger: Logger
  sealer: Sealer
  fetch: Fetch
  /** `highsea v{version}`. */
  userAgent: string
  /** highsea's OpenSubtitles.com consumer key (`HIGHSEA_OPENSUBTITLES_KEY`); null in a source build. */
  openSubtitlesKey: string | null
}

type Row = typeof subtitleProviders.$inferSelect

/** A provider as the API lists it (`SubtitleProvider`). */
export type ProviderView = {
  id: ProviderId
  name: string
  url: string
  enabled: boolean
  requiresAuth: boolean
  /** The username or masked key; null until an account is added. */
  account: string | null
  /** Downloads (OpenSubtitles.com) or requests left today, and the day's limit; null when unknown. */
  rateLimitRemaining: number | null
  rateLimitMax: number | null
  throttledUntil: string | null
  throttleReason: ThrottleReason | null
  fields: { key: string; secret: boolean; set: boolean; value: string | null }[]
  attribution: string | null
  /** Why it can't be used at all in this build (OpenSubtitles.com without highsea's key). */
  unavailable: string | null
}

export const NO_APP_KEY =
  'This build of highsea has no OpenSubtitles.com key. The release images include one.'

const masked = (key: string) => `••••${key.slice(-4)}`

export function createAccounts(deps: AccountsDeps) {
  const { db, clock, sealer } = deps
  const log = deps.logger.child('subtitles')

  function seed() {
    const now = clock.now()
    for (const id of PROVIDER_ORDER)
      db.insert(subtitleProviders)
        .values({ id, enabled: false, updatedAt: now })
        .onConflictDoNothing()
        .run()
  }

  function row(id: ProviderId): Row {
    const r = db.select().from(subtitleProviders).where(eq(subtitleProviders.id, id)).get()
    if (!r) throw new AppError('not-found', 'That provider doesn’t exist.')
    return r
  }

  const update = (id: ProviderId, set: Partial<Row>) =>
    db
      .update(subtitleProviders)
      .set({ ...set, updatedAt: clock.now() })
      .where(eq(subtitleProviders.id, id))
      .run()

  function credentialsOf(r: Row): Record<string, string> | null {
    if (!r.credentials) return null
    try {
      return JSON.parse(sealer.open(r.credentials)) as Record<string, string>
    } catch {
      log.warn('couldn’t open a provider’s account', { provider: r.id })
      return null
    }
  }

  const unavailable = (id: ProviderId) =>
    id === 'opensubtitles' && !deps.openSubtitlesKey ? NO_APP_KEY : null

  /** A new day, by the provider's clock: the count starts again. */
  function rollDay(r: Row, now: number): Row {
    if (r.quotaResetsAt !== null && r.quotaResetsAt <= now) {
      const next = { quotaUsed: 0, quotaResetsAt: nextUtcMidnight(now) }
      update(r.id, next)
      return { ...r, ...next }
    }
    return r
  }

  /** The store an adapter reads and writes, backed by the row; `credentials` overrides for a test. */
  function storeFor(id: ProviderId, override?: Record<string, string>): ProviderStore {
    let token: ProviderToken | null = null
    return {
      credentials: () => override ?? credentialsOf(row(id)),
      token() {
        if (override) return token
        const r = row(id)
        if (!r.token || r.tokenExpiresAt === null) return null
        try {
          return { value: sealer.open(r.token), expiresAt: r.tokenExpiresAt, baseUrl: r.baseUrl }
        } catch {
          return null
        }
      },
      saveToken(t) {
        if (override) {
          token = t
          return
        }
        update(id, {
          token: t ? sealer.seal(t.value) : null,
          tokenExpiresAt: t?.expiresAt ?? null,
          baseUrl: t?.baseUrl ?? null,
        })
      },
      saveQuota({ remaining, limit, resetsAt }) {
        if (override) return
        const r = row(id)
        // a sign-in reports only the allowance, a download only what's left
        if (remaining === null) {
          if (limit !== null) update(id, { quotaLimit: limit })
          return
        }
        const max = Math.max(limit ?? r.quotaLimit ?? remaining, remaining)
        update(id, {
          quotaLimit: max,
          quotaUsed: Math.max(0, max - remaining),
          quotaResetsAt: resetsAt ?? nextUtcMidnight(clock.now()),
        })
      },
      link(key) {
        const now = clock.now()
        db.delete(subtitleDownloads).where(lt(subtitleDownloads.expiresAt, now)).run()
        return (
          db.select().from(subtitleDownloads).where(eq(subtitleDownloads.key, key)).get()?.link ??
          null
        )
      },
      saveLink(key, link, expiresAt) {
        db.insert(subtitleDownloads)
          .values({ key, link, expiresAt, createdAt: clock.now() })
          .onConflictDoUpdate({ target: subtitleDownloads.key, set: { link, expiresAt } })
          .run()
      },
      dropLink(key) {
        db.delete(subtitleDownloads).where(eq(subtitleDownloads.key, key)).run()
      },
    }
  }

  function adapter(id: ProviderId, override?: Record<string, string>): Provider {
    return createProvider(id, {
      fetch: deps.fetch,
      clock,
      userAgent: deps.userAgent,
      store: storeFor(id, override),
      openSubtitlesKey: deps.openSubtitlesKey,
    })
  }

  const throttleOf = (r: Row): ThrottleState => ({
    throttledUntil: r.throttledUntil,
    throttleReason: r.throttleReason as ThrottleReason | null,
    failures: (r.failures as number[]) ?? [],
  })

  /** Whether a provider can be asked now: on, with an account, usable in this build, not waiting. */
  function ready(id: ProviderId): boolean {
    const r = row(id)
    return r.enabled && r.credentials !== null && !unavailable(id) && !throttled(r, clock.now())
  }

  /** The providers to ask, in the order ties go. */
  function active(): ProviderId[] {
    return PROVIDER_ORDER.filter(ready)
  }

  /**
   * One call to a provider. A provider that's waiting isn't asked (a ProviderError of its reason);
   * a failure sets its throttle, a success clears its counted failures.
   */
  async function call<T>(id: ProviderId, fn: (p: Provider) => Promise<T>): Promise<T> {
    const now = clock.now()
    let r = rollDay(row(id), now)
    if (throttled(r, now))
      throw new ProviderError('rate-limited', `${PROVIDER_INFO[id].name} is waiting.`)
    if (PROVIDER_INFO[id].counts === 'requests') {
      update(id, {
        quotaUsed: r.quotaUsed + 1,
        quotaLimit: PROVIDER_INFO[id].dailyLimit,
        quotaResetsAt: r.quotaResetsAt ?? nextUtcMidnight(now),
      })
      r = row(id)
    }
    try {
      const out = await fn(adapter(id))
      const before = throttleOf(row(id))
      if (before.failures.length > 0) update(id, { failures: afterSuccess(before).failures })
      return out
    } catch (e) {
      const error =
        e instanceof ProviderError ? e : new ProviderError('unavailable', (e as Error).message)
      const next = afterFailure(throttleOf(row(id)), error, id, clock.now())
      update(id, {
        throttledUntil: next.throttledUntil,
        throttleReason: next.throttleReason,
        failures: next.failures,
      })
      if (next.throttledUntil !== null && next.throttledUntil > now)
        log.warn('a subtitle provider is waiting', {
          provider: id,
          reason: next.throttleReason,
          until: new Date(next.throttledUntil).toISOString(),
        })
      throw error
    }
  }

  function view(r: Row): ProviderView {
    const info = PROVIDER_INFO[r.id]
    const now = clock.now()
    const creds = credentialsOf(r)
    const reset = r.quotaResetsAt !== null && r.quotaResetsAt <= now
    const used = reset ? 0 : r.quotaUsed
    const max = r.quotaLimit ?? info.dailyLimit
    const waiting = throttled(r, now)
    return {
      id: r.id,
      name: info.name,
      url: info.url,
      enabled: r.enabled,
      requiresAuth: true,
      account: r.account,
      // a provider waiting shows its bar empty, in warning tone (subtitles.md)
      rateLimitRemaining: waiting ? 0 : max === null ? null : Math.max(0, max - used),
      rateLimitMax: max,
      throttledUntil:
        waiting && r.throttledUntil !== null ? new Date(r.throttledUntil).toISOString() : null,
      throttleReason: waiting ? (r.throttleReason as ThrottleReason | null) : null,
      fields: info.fields.map((f) => ({
        key: f.key,
        secret: f.secret,
        set: Boolean(creds?.[f.key]),
        value: f.secret ? null : (creds?.[f.key] ?? null),
      })),
      attribution: info.attribution,
      unavailable: unavailable(r.id),
    }
  }

  function list(): ProviderView[] {
    return PROVIDER_ORDER.map((id) => view(row(id)))
  }

  function get(id: ProviderId): ProviderView {
    return view(row(id))
  }

  function toggle(id: ProviderId, enabled: boolean): ProviderView {
    const r = row(id)
    if (enabled && unavailable(id))
      throw new AppError('conflict', NO_APP_KEY, { reason: 'no-app-key' })
    if (enabled && !r.credentials)
      throw new AppError('conflict', 'Add your account first.', { reason: 'no-account' })
    update(id, { enabled })
    return get(id)
  }

  /** The fields as given, a blank secret keeping the stored one. */
  function merged(id: ProviderId, given: Record<string, string>): Record<string, string> {
    const stored = credentialsOf(row(id)) ?? {}
    const out: Record<string, string> = {}
    for (const f of PROVIDER_INFO[id].fields) {
      const value = (given[f.key] ?? '').trim()
      const kept = value || (f.secret ? (stored[f.key] ?? '') : '')
      if (!kept) throw new AppError('invalid', 'Fill in every field.', { reason: f.key })
      out[f.key] = kept
    }
    return out
  }

  const accountLabel = (creds: Record<string, string>) =>
    creds.username ?? (creds.apiKey ? masked(creds.apiKey) : null)

  /** Saves an account: sealed, its token and any wait for a refused login cleared. */
  function save(id: ProviderId, given: Record<string, string>): ProviderView {
    const creds = merged(id, given)
    const r = row(id)
    update(id, {
      credentials: sealer.seal(JSON.stringify(creds)),
      account: accountLabel(creds),
      token: null,
      tokenExpiresAt: null,
      baseUrl: null,
      ...(r.throttleReason === 'auth' ? { throttledUntil: null, throttleReason: null } : {}),
    })
    return get(id)
  }

  /** Signs in with the fields given (or the stored ones), without saving: the Edit dialog's Test. */
  async function test(
    id: ProviderId,
    given?: Record<string, string>,
  ): Promise<{ ok: boolean; message: string; account: ProviderAccount | null }> {
    if (unavailable(id)) return { ok: false, message: NO_APP_KEY, account: null }
    let creds: Record<string, string>
    try {
      creds = given ? merged(id, given) : (credentialsOf(row(id)) ?? merged(id, {}))
    } catch (e) {
      return { ok: false, message: (e as Error).message, account: null }
    }
    try {
      const account = await adapter(id, creds).account(AbortSignal.timeout(20_000))
      return { ok: true, message: `Signed in to ${PROVIDER_INFO[id].name}.`, account }
    } catch (e) {
      const kind = e instanceof ProviderError ? e.kind : 'unavailable'
      const name = PROVIDER_INFO[id].name
      const message =
        kind === 'auth'
          ? `${name} refused the account. Check it and try again.`
          : kind === 'rate-limited'
            ? `${name} is busy. Try again in a minute.`
            : kind === 'no-account'
              ? 'Fill in every field.'
              : `${name} didn’t answer. Try again later.`
      return { ok: false, message, account: null }
    }
  }

  /** System health: a refused login (warning) and a provider out of downloads (notice). */
  function issues(): { id: string; level: 'warning' | 'notice'; message: string; since: number }[] {
    const now = clock.now()
    const out: { id: string; level: 'warning' | 'notice'; message: string; since: number }[] = []
    for (const id of PROVIDER_ORDER) {
      const r = row(id)
      if (!r.enabled || !throttled(r, now)) continue
      const name = PROVIDER_INFO[id].name
      if (r.throttleReason === 'auth')
        out.push({
          id: `subtitles:${id}:auth`,
          level: 'warning',
          message:
            id === 'opensubtitles'
              ? `${name} refused the password. Sign in again in Subtitles.`
              : `${name} refused the key. Check it in Subtitles.`,
          since: r.updatedAt,
        })
      else if (r.throttleReason === 'quota' && r.throttledUntil !== null)
        out.push({
          id: `subtitles:${id}:quota`,
          level: 'notice',
          message: `${name} has no downloads left today. They come back at ${new Date(r.throttledUntil).toISOString().slice(11, 16)} UTC.`,
          since: r.updatedAt,
        })
    }
    return out
  }

  return { seed, list, get, toggle, save, test, call, active, ready, issues, adapter }
}

export type Accounts = ReturnType<typeof createAccounts>
