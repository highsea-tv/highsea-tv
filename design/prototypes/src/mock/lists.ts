// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Import lists (ADR 0045), as packages/lists answers it: lists checked at once rather
// than every 6 hours, Trakt's device code approved on the second poll as the server's fake does,
// and the exclusions. A list whose address or number says "wrong" can't be read, and a list whose
// last check failed keeps failing until its source is edited.
import { iso } from './clock.ts'
import type { SettingsDeps } from './settings.ts'
import type { ImportList, ImportListInput, ImportListSettings } from './types.ts'

export type ImportListTest = { ok: boolean; message: string; found: number }
export type TraktDeviceCode = {
  userCode: string
  verificationUrl: string
  expiresAt: string
  interval: number
}

/** How many titles each source holds in the mock. Charts give their top 20. */
const sizeOf = (s: ImportListSettings) =>
  s.kind === 'generic' ? 36 : s.source === 'list' ? 24 : s.source === 'watchlist' ? 18 : 20

const unreadable = (s: ImportListSettings) =>
  /wrong/i.test(s.kind === 'generic' ? s.url : (s.list ?? ''))

const readError = (s: ImportListSettings) =>
  s.kind === 'generic'
    ? 'The address answered 404 Not Found.'
    : s.kind === 'tmdb'
      ? 'TMDB has no list with that number.'
      : 'Trakt has no public list at that address.'

export function importListsApi(d: SettingsDeps) {
  const s = d.settings
  let pending: { expiresAt: number; polls: number } | null = null
  let lists = 0
  const announce = () => d.emit({ type: 'settings.updated' })

  const row = (id: string) => {
    const l = s.importLists.find((x) => x.id === id)
    if (!l) throw d.fail(404, 'not-found', 'There’s no such list.')
    return l
  }

  const validate = (input: ImportListInput) => {
    if (!input.name.trim())
      throw d.fail(400, 'invalid', 'Give the list a name.', { field: 'name', reason: 'required' })
    if (!s.rootFolders.some((f) => f.path === input.rootFolder))
      throw d.fail(400, 'invalid', 'That folder isn’t one of the root folders.', {
        field: 'rootFolder',
        reason: 'unknown',
      })
    const x = input.settings
    if (x.kind === 'trakt' && !s.trakt.available)
      throw d.fail(
        400,
        'invalid',
        'This build of highsea doesn’t have its Trakt application, so Trakt lists can’t be used.',
        { field: 'settings.kind', reason: 'trakt-unavailable' },
      )
    if (x.kind !== 'generic' && x.source === 'list' && !x.list?.trim())
      throw d.fail(400, 'invalid', 'Paste the list’s address.', {
        field: 'settings.list',
        reason: 'required',
      })
    if (x.kind === 'generic' && !/^https?:\/\//.test(x.url))
      throw d.fail(400, 'invalid', 'Use an address that starts with https:// or http://.', {
        field: 'url',
        reason: 'invalid',
      })
    if (x.kind === 'trakt' && x.source === 'watchlist' && !s.trakt.account)
      throw d.fail(400, 'invalid', 'Connect your Trakt account to use your watchlist.', {
        field: 'settings.source',
        reason: 'trakt-account',
      })
  }

  /** One check: what the list holds is counted, and nothing new comes in the mock. */
  const sync = (l: ImportList) => {
    l.lastSync = iso(d.now())
    if (unreadable(l.settings) || l.lastResult?.error) {
      l.lastResult = {
        found: 0,
        added: 0,
        skipped: 0,
        unresolved: [],
        error: l.lastResult?.error ?? readError(l.settings),
      }
      return
    }
    const found = sizeOf(l.settings)
    l.items = found
    l.lastResult = {
      found,
      added: 0,
      skipped: found,
      unresolved: l.lastResult?.unresolved ?? [],
      error: null,
    }
  }

  return {
    list: () => {
      d.requireStaff()
      return s.importLists
    },
    trakt: () => {
      d.requireStaff()
      return s.trakt
    },
    add: (input: ImportListInput) => {
      d.requireStaff()
      validate(input)
      const l: ImportList = {
        ...input,
        name: input.name.trim(),
        id: `il-new-${++lists}`,
        items: 0,
        lastSync: null,
        lastResult: null,
      }
      // added lists are checked at once (packages/lists queues the check)
      if (l.enabled) sync(l)
      s.importLists.push(l)
      announce()
      return l
    },
    update: (id: string, input: ImportListInput) => {
      d.requireStaff()
      const l = row(id)
      validate(input)
      const moved = JSON.stringify(l.settings) !== JSON.stringify(input.settings)
      Object.assign(l, input, { name: input.name.trim() })
      // a new source starts over: the old result was about another list
      if (moved) l.lastResult = null
      announce()
      return l
    },
    remove: (id: string) => {
      d.requireStaff()
      row(id)
      s.importLists = s.importLists.filter((l) => l.id !== id)
      announce()
    },
    sync: (id: string) => {
      d.requireStaff()
      sync(row(id))
      announce()
    },
    test: (settings: ImportListSettings): ImportListTest => {
      d.requireStaff()
      if (settings.kind === 'trakt' && !s.trakt.available)
        throw d.fail(400, 'invalid', 'This build of highsea doesn’t have its Trakt application.', {
          field: 'settings.kind',
        })
      if (unreadable(settings)) return { ok: false, message: readError(settings), found: 0 }
      const found = sizeOf(settings)
      return { ok: true, message: `highsea can read this list: ${found} movies.`, found }
    },
    traktConnect: (): TraktDeviceCode => {
      d.requireStaff()
      const expiresAt = d.now() + 10 * 60_000
      pending = { expiresAt, polls: 0 }
      return {
        userCode: 'H7Q2-K9XM',
        verificationUrl: 'https://trakt.tv/activate',
        expiresAt: iso(expiresAt),
        interval: 2,
      }
    },
    traktPoll: (): { state: 'pending' | 'connected' | 'expired' | 'denied' } => {
      d.requireStaff()
      if (!pending) return { state: 'expired' }
      if (d.now() > pending.expiresAt) {
        pending = null
        return { state: 'expired' }
      }
      if (++pending.polls < 2) return { state: 'pending' }
      pending = null
      s.trakt.account = 'harbor-ines'
      announce()
      return { state: 'connected' }
    },
    traktDisconnect: () => {
      d.requireStaff()
      s.trakt.account = null
      announce()
    },
    exclusions: () => {
      d.requireStaff()
      return [...s.listExclusions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    removeExclusion: (tmdbId: number) => {
      d.requireStaff()
      if (!s.listExclusions.some((e) => e.tmdbId === tmdbId))
        throw d.fail(404, 'not-found', 'That movie isn’t excluded.')
      s.listExclusions = s.listExclusions.filter((e) => e.tmdbId !== tmdbId)
      announce()
    },
  }
}
