// SPDX-License-Identifier: AGPL-3.0-only
// The import lists service (settings.md › Import lists; checkpoint 8a, ADR 0045):
// - the lists, each a source (TMDB, Trakt or a generic URL) with the folder, profiles and
//   monitoring the movies it adds get;
// - checking a list: read it, match each title to a TMDB id (an IMDb id through TMDB's Find), keep
//   what it holds, and add what the library doesn't have and no exclusion stops. A list never removes
//   anything (milestone 1's rule, Radarr's default);
// - `lists.sync`, every 6 hours for every list that's on, and for one list when it's saved or Check
//   now is pressed. Adding is keyed by TMDB id and the add of a movie already here changes nothing,
//   so a repeated run adds nothing twice (ADR 0022);
// - exclusions (Radarr's import list exclusions), written when a movie is deleted with "Don't add it
//   again from lists".
import type {
  ImportList,
  ImportListInput,
  ImportListResult,
  ImportListSettings,
  ImportListTest,
  ListExclusion,
} from '@highsea/api-contract'
import { AppError, type Clock, type EventBus, type Fetch, type Logger, newId } from '@highsea/core'
import { type Db, schema } from '@highsea/db'
import type { JobQueue } from '@highsea/jobs'
import type { Metadata } from '@highsea/metadata'
import { asc, count, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { readGeneric } from '../generic/index.ts'
import { entryName, type ListEntry } from '../shared/index.ts'
import { readTmdb } from '../tmdb/index.ts'
import type { Trakt } from '../trakt/index.ts'

const { importLists, importListItems, importListExclusions } = schema

export const LISTS_TOPIC = 'lists.updated'
export const LIST_SYNC_JOB = 'lists.sync'
export const LIST_SYNC_EVERY_MS = 6 * 60 * 60 * 1000
/** Unmatched titles a result names. */
const UNRESOLVED_MAX = 20
const CHUNK = 500

/** What the lists need from the movie library; the runtime adapts `movies` to it. */
export type ListLibrary = {
  /** Whether the movie is in the library. */
  has(tmdbIds: number[]): Set<number>
  /** Adds a movie; one already here is left as it is. */
  add(input: {
    tmdbId: number
    rootFolder: string
    qualityProfileId: string
    languageProfileId: string | null
    monitored: boolean
    minimumAvailability: ImportListInput['minimumAvailability']
    searchNow: boolean
  }): Promise<void>
  /** Throws an `invalid` AppError naming the field when a folder or profile doesn't exist. */
  check(input: Pick<ImportListInput, 'rootFolder' | 'qualityProfileId' | 'languageProfileId'>): void
  /** Whether a search can run: an indexer is on. */
  canSearch(): boolean
}

type Row = typeof importLists.$inferSelect

export function createLists(deps: {
  db: Db
  clock: Clock
  events: EventBus
  jobs: JobQueue
  logger: Logger
  fetch: Fetch
  metadata: Metadata
  trakt: Trakt
  library: ListLibrary
  /** A run added movies (8b's "movie added" notification): once per run, with what it added. */
  onAdded?(run: { listId: string; name: string; at: number; tmdbIds: number[] }): void
}) {
  const { db, clock, events, jobs, metadata, trakt, library } = deps
  const log = deps.logger.child('lists')
  const announce = () => events.emit({ topic: LISTS_TOPIC })

  function read(settings: ImportListSettings): Promise<ListEntry[]> {
    switch (settings.kind) {
      case 'tmdb':
        return readTmdb(metadata, settings)
      case 'trakt':
        return trakt.read(settings)
      case 'generic':
        return readGeneric(deps.fetch, settings.url)
    }
  }

  function view(row: Row, items: number): ImportList {
    const settings = row.settings as ImportListSettings
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      enabled: row.enabled,
      settings,
      rootFolder: row.rootFolder,
      qualityProfileId: row.qualityProfileId,
      languageProfileId: row.languageProfileId,
      monitored: row.monitored,
      minimumAvailability: row.minimumAvailability,
      searchOnAdd: row.searchOnAdd,
      lastSync: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
      lastResult: (row.lastResult as ImportListResult | null) ?? null,
      items,
    }
  }

  function counts(ids: string[]): Map<string, number> {
    if (!ids.length) return new Map()
    return new Map(
      db
        .select({ listId: importListItems.listId, n: count() })
        .from(importListItems)
        .where(inArray(importListItems.listId, ids))
        .groupBy(importListItems.listId)
        .all()
        .map((r) => [r.listId, r.n]),
    )
  }

  function requireRow(id: string): Row {
    const row = db.select().from(importLists).where(eq(importLists.id, id)).get()
    if (!row) throw new AppError('not-found', 'There’s no such list.')
    return row
  }

  /** Checks the settings' shape before saving: a list address the source can read. */
  function validate(input: ImportListInput) {
    if (!input.name.trim())
      throw new AppError('invalid', 'Give the list a name.', { field: 'name', reason: 'required' })
    library.check(input)
    const s = input.settings
    if (s.kind === 'trakt' && !trakt.status().available)
      throw new AppError(
        'invalid',
        'This build of highsea doesn’t have its Trakt application, so Trakt lists can’t be used.',
        { field: 'settings.kind', reason: 'trakt-unavailable' },
      )
    if ((s.kind === 'tmdb' || s.kind === 'trakt') && s.source === 'list' && !s.list?.trim())
      throw new AppError('invalid', 'Paste the list’s address.', {
        field: 'settings.list',
        reason: 'required',
      })
    if (s.kind === 'trakt' && s.source === 'watchlist' && !trakt.status().account)
      throw new AppError('invalid', 'Connect your Trakt account to use your watchlist.', {
        field: 'settings.source',
        reason: 'trakt-account',
      })
  }

  const queueSync = (id: string) =>
    jobs.enqueue(LIST_SYNC_JOB, { listId: id }, { dedupeKey: `list:${id}` })

  /** Matches each entry to a TMDB id; IMDb ids are looked up once each. */
  async function resolve(entries: ListEntry[]) {
    const found = new Map<number, ListEntry>()
    const unresolved: string[] = []
    for (const e of entries) {
      let tmdbId = e.tmdbId
      if (!tmdbId && e.imdbId) {
        try {
          const movie = await metadata.discover.findByImdb(e.imdbId)
          tmdbId = movie?.id ?? null
          if (movie && !e.title) e.title = movie.title
        } catch (err) {
          // TMDB without a key or not answering: the whole check fails, not one title
          if (err instanceof AppError && err.code !== 'not-found') throw err
        }
      }
      if (tmdbId) {
        if (!found.has(tmdbId)) found.set(tmdbId, { ...e, tmdbId })
      } else unresolved.push(entryName(e))
    }
    return { found, unresolved }
  }

  /** Checks one list: what it holds is kept, and its new movies are added. */
  async function sync(id: string): Promise<ImportListResult> {
    const row = requireRow(id)
    const now = clock.now()
    let result: ImportListResult
    try {
      const entries = await read(row.settings as ImportListSettings)
      const { found, unresolved } = await resolve(entries)
      const ids = [...found.keys()]
      db.transaction((tx) => {
        tx.delete(importListItems).where(eq(importListItems.listId, id)).run()
        for (let i = 0; i < ids.length; i += CHUNK)
          tx.insert(importListItems)
            .values(
              ids.slice(i, i + CHUNK).map((tmdbId) => {
                const e = found.get(tmdbId) as ListEntry
                return { listId: id, tmdbId, title: e.title, year: e.year, seenAt: now }
              }),
            )
            .run()
      })
      const excluded = new Set<number>()
      for (let i = 0; i < ids.length; i += CHUNK)
        for (const r of db
          .select({ tmdbId: importListExclusions.tmdbId })
          .from(importListExclusions)
          .where(inArray(importListExclusions.tmdbId, ids.slice(i, i + CHUNK)))
          .all())
          excluded.add(r.tmdbId)
      const present = library.has(ids)
      const searchNow = row.searchOnAdd && library.canSearch()
      const added: number[] = []
      let skipped = 0
      for (const tmdbId of ids) {
        if (excluded.has(tmdbId) || present.has(tmdbId)) {
          skipped++
          continue
        }
        try {
          await library.add({
            tmdbId,
            rootFolder: row.rootFolder,
            qualityProfileId: row.qualityProfileId,
            languageProfileId: row.languageProfileId,
            monitored: row.monitored,
            minimumAvailability: row.minimumAvailability,
            searchNow,
          })
          added.push(tmdbId)
        } catch (err) {
          if (!(err instanceof AppError) || err.code === 'unavailable') throw err
          log.warn('couldn’t add a movie from a list', {
            list: row.name,
            tmdbId,
            error: err.message,
          })
          unresolved.push(entryName(found.get(tmdbId) as ListEntry))
        }
      }
      result = {
        found: entries.length,
        added: added.length,
        skipped,
        unresolved: unresolved.slice(0, UNRESOLVED_MAX),
        error: null,
      }
      log.info('checked a list', {
        list: row.name,
        found: entries.length,
        added: added.length,
        skipped,
      })
      if (added.length)
        try {
          deps.onAdded?.({ listId: id, name: row.name, at: now, tmdbIds: added })
        } catch (e) {
          log.warn('a list listener failed', { list: row.name, error: (e as Error).message })
        }
    } catch (err) {
      if (!(err instanceof AppError)) throw err
      // the list couldn't be read: what it held last time stays
      result = { found: 0, added: 0, skipped: 0, unresolved: [], error: err.message }
      log.warn('couldn’t check a list', { list: row.name, error: err.message })
    }
    db.update(importLists)
      .set({ lastSyncAt: now, lastResult: result })
      .where(eq(importLists.id, id))
      .run()
    announce()
    return result
  }

  jobs.define({
    type: LIST_SYNC_JOB,
    payload: z.object({ listId: z.string().optional() }),
    attempts: 2,
    timeoutMs: 60 * 60 * 1000,
    async run({ listId }) {
      if (listId) {
        if (db.select().from(importLists).where(eq(importLists.id, listId)).get())
          await sync(listId)
        return
      }
      for (const row of db
        .select({ id: importLists.id })
        .from(importLists)
        .where(eq(importLists.enabled, true))
        .orderBy(asc(importLists.createdAt))
        .all())
        await sync(row.id)
    },
  })

  function values(input: ImportListInput) {
    return {
      kind: input.settings.kind,
      name: input.name.trim(),
      enabled: input.enabled,
      settings: input.settings,
      rootFolder: input.rootFolder,
      qualityProfileId: input.qualityProfileId,
      languageProfileId: input.languageProfileId,
      monitored: input.monitored,
      minimumAvailability: input.minimumAvailability,
      searchOnAdd: input.searchOnAdd,
    }
  }

  return {
    list(): ImportList[] {
      const rows = db.select().from(importLists).orderBy(asc(importLists.name)).all()
      const n = counts(rows.map((r) => r.id))
      return rows.map((r) => view(r, n.get(r.id) ?? 0))
    },
    get(id: string): ImportList {
      return view(requireRow(id), counts([id]).get(id) ?? 0)
    },
    /** Adds a list; it's checked straight away when it's on. */
    add(input: ImportListInput): ImportList {
      validate(input)
      const now = clock.now()
      const id = newId('lst')
      db.insert(importLists)
        .values({ id, ...values(input), createdAt: now, updatedAt: now })
        .run()
      if (input.enabled) queueSync(id)
      announce()
      return this.get(id)
    },
    update(id: string, input: ImportListInput): ImportList {
      requireRow(id)
      validate(input)
      db.update(importLists)
        .set({ ...values(input), updatedAt: clock.now() })
        .where(eq(importLists.id, id))
        .run()
      if (input.enabled) queueSync(id)
      announce()
      return this.get(id)
    },
    /** Removes a list; the movies it added stay. */
    remove(id: string) {
      requireRow(id)
      db.delete(importLists).where(eq(importLists.id, id)).run()
      announce()
    },
    /** Check now: queues the list's check. */
    syncNow(id: string) {
      requireRow(id)
      queueSync(id)
    },
    sync,
    /** Reads a list without saving it or adding anything. */
    async test(settings: ImportListSettings): Promise<ImportListTest> {
      try {
        const entries = await read(settings)
        return {
          ok: true,
          message: entries.length
            ? `highsea can read this list: ${entries.length} ${entries.length === 1 ? 'movie' : 'movies'}.`
            : 'highsea can read this list, but it has no movies yet.',
          found: entries.length,
        }
      } catch (err) {
        if (!(err instanceof AppError)) throw err
        if (err.code === 'invalid') throw err
        return { ok: false, message: err.message, found: 0 }
      }
    },
    exclusions(): ListExclusion[] {
      return db
        .select()
        .from(importListExclusions)
        .orderBy(desc(importListExclusions.createdAt), asc(importListExclusions.tmdbId))
        .all()
        .map((r) => ({
          tmdbId: r.tmdbId,
          title: r.title,
          year: r.year,
          createdAt: new Date(r.createdAt).toISOString(),
        }))
    },
    /** Stops lists adding these movies again; safe to repeat. */
    exclude(movies: { tmdbId: number; title: string; year: number | null }[]) {
      if (!movies.length) return
      const now = clock.now()
      for (let i = 0; i < movies.length; i += CHUNK)
        db.insert(importListExclusions)
          .values(movies.slice(i, i + CHUNK).map((m) => ({ ...m, createdAt: now })))
          .onConflictDoNothing()
          .run()
      announce()
    },
    removeExclusion(tmdbId: number) {
      const gone = db
        .delete(importListExclusions)
        .where(eq(importListExclusions.tmdbId, tmdbId))
        .returning({ tmdbId: importListExclusions.tmdbId })
        .all()
      if (!gone.length) throw new AppError('not-found', 'That movie isn’t excluded.')
      announce()
    },
    /** Whether a movie is on any list, for the delete dialog's "Don't add it again" option. */
    onAList(tmdbId: number): boolean {
      return !!db
        .select({ listId: importListItems.listId })
        .from(importListItems)
        .where(eq(importListItems.tmdbId, tmdbId))
        .get()
    },
    trakt,
    /** Every list checked every 6 hours, first half an hour after boot. */
    schedule(now: number) {
      jobs.schedule(LIST_SYNC_JOB, LIST_SYNC_EVERY_MS, { firstRunAt: now + 30 * 60 * 1000 })
    },
  }
}

export type Lists = ReturnType<typeof createLists>
