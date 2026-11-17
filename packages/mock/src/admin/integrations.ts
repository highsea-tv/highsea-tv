// SPDX-License-Identifier: AGPL-3.0-only
// The admin's integration routes (one-client-platform-d.md › D3): Settings › Connections and
// notifications (connections and this person's browsers), Import lists (the lists, Trakt's device
// flow and the exclusions) and Migration (the Radarr and qBittorrent importers), answered from the
// mock's own api in the contract's shapes, each write raising the topic the server raises.
//
// What the mock keeps beyond the contract stays in the mock: a connection's stage-6 show events
// (drawn for the TV series phase) are left out of what's read and kept on an update, and a list of
// shows (stage 6) isn't listed, as a server without shows has none. The contract's `kind` on a list
// is its source's kind (TMDB, Trakt or generic); the mock's is what it adds, always movies here.
// The connections' log and the server's push key aren't answered (501): the prototype has no
// service worker, so a browser can't subscribe in it.
import {
  CONNECTIONS_TOPICS,
  type Connection,
  type ImportList,
  type ImportStatus,
  LIST_TOPICS,
  MIGRATION_TOPIC,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  type QbittorrentImportStatus,
  TMDB_LIST_SOURCES,
  TRAKT_LIST_SOURCES,
} from '@highsea-tv/api-contract'
import { EPOCH } from '../clock.ts'
import type { Connection as MockConnection, NotificationEvent as MockEvent } from '../settings.ts'
import type { ImportList as MockList } from '../types.ts'
import type { AdminKit, Answers } from './kit.ts'

/** How often a running import's progress is raised (the server raises it as items come across). */
const PROGRESS_MS = 1000

const contractEvent = (e: MockEvent): e is NotificationEvent =>
  (NOTIFICATION_EVENTS as readonly string[]).includes(e)

export function integrationsAnswers(kit: AdminKit): Answers {
  const { wall, wallMs, emit } = kit

  // the mock keeps no times on a connection; the server's are its seed's, at the mock's epoch
  const connectionOf = (c: MockConnection): Connection => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    enabled: c.enabled,
    events: c.events.filter(contractEvent),
    settings: c.settings,
    serverMail: c.serverMail,
    tags: c.tags ?? [],
    createdAt: wallMs(EPOCH),
    updatedAt: wallMs(EPOCH),
    lastSentAt: c.lastSentAt && wall(c.lastSentAt),
    lastError: c.lastError,
  })

  /** A list the contract can carry: of movies, from a movies source (not TMDB's TV charts). */
  const movieList = (l: MockList) =>
    l.kind === 'movies' &&
    (l.settings.kind === 'generic' ||
      (l.settings.kind === 'tmdb'
        ? (TMDB_LIST_SOURCES as readonly string[])
        : (TRAKT_LIST_SOURCES as readonly string[])
      ).includes(l.settings.source))

  const listOf = ({ monitor: _, ...l }: MockList): ImportList => ({
    ...l,
    settings: l.settings as ImportList['settings'],
    kind: l.settings.kind,
    lastSync: l.lastSync && wall(l.lastSync),
  })

  /** The importers' status, its times on the wall clock. */
  const statusOf = <S extends ImportStatus>(st: S): S => ({
    ...st,
    startedAt: st.startedAt && wall(st.startedAt),
    finishedAt: st.finishedAt && wall(st.finishedAt),
  })

  // while an import runs its progress is raised each second, as the server raises it per item;
  // one timer at a time, started by a read that finds it running
  let ticking: ReturnType<typeof setTimeout> | null = null
  const follow = (state: ImportStatus['state']) => {
    if (state !== 'running' || ticking) return
    ticking = setTimeout(() => {
      ticking = null
      emit(MIGRATION_TOPIC)
    }, PROGRESS_MS)
    ;(ticking as { unref?: () => void }).unref?.()
  }

  return {
    connections: {
      list: (_, ctx) => ctx.api.connections.list().map(connectionOf),
      add: ({ body }, ctx) => {
        const c = ctx.api.connections.add({
          ...body,
          serverMail: body.serverMail ?? false,
          tags: body.tags ?? [],
        })
        emit(CONNECTIONS_TOPICS.connections)
        return connectionOf(c)
      },
      update: ({ params, body }, ctx) => {
        const before = ctx.api.connections.list().find((c) => c.id === params.id)
        // the events the contract doesn't know (stage 6's) stay as they were
        const kept = (before?.events ?? []).filter((e) => !contractEvent(e))
        const c = ctx.api.connections.update(params.id, {
          ...body,
          events: [...body.events, ...kept],
          serverMail: body.serverMail ?? false,
          tags: body.tags ?? before?.tags ?? [],
        })
        emit(CONNECTIONS_TOPICS.connections)
        return connectionOf(c)
      },
      remove: ({ params }, ctx) => {
        ctx.api.connections.remove(params.id)
        emit(CONNECTIONS_TOPICS.connections)
      },
      test: ({ body }, ctx) => ctx.api.connections.test(body),
      testSaved: ({ params }, ctx) => {
        const out = ctx.api.connections.testSaved(params.id)
        emit(CONNECTIONS_TOPICS.connections)
        return out
      },
    },
    pushSubscriptions: {
      list: (_, ctx) =>
        ctx.api.pushSubscriptions.list().map((p) => ({
          id: p.id,
          label: p.label,
          service: p.service,
          createdAt: wall(p.createdAt),
        })),
      add: ({ body }, ctx) => {
        const p = ctx.api.pushSubscriptions.add(body.label)
        emit(CONNECTIONS_TOPICS.connections)
        return { id: p.id, label: p.label, service: p.service, createdAt: wall(p.createdAt) }
      },
      remove: ({ params }, ctx) => {
        ctx.api.pushSubscriptions.remove(params.id)
        emit(CONNECTIONS_TOPICS.connections)
      },
    },
    importLists: {
      list: (_, ctx) => ctx.api.importLists.list().filter(movieList).map(listOf),
      trakt: (_, ctx) => ({ ...ctx.api.importLists.trakt() }),
      add: ({ body }, ctx) => {
        const l = ctx.api.importLists.add({ ...body, kind: 'movies', tags: body.tags ?? [] })
        emit(LIST_TOPICS.lists)
        return listOf(l)
      },
      update: ({ params, body }, ctx) => {
        const l = ctx.api.importLists.update(params.id, {
          ...body,
          kind: 'movies',
          tags: body.tags ?? [],
        })
        emit(LIST_TOPICS.lists)
        return listOf(l)
      },
      remove: ({ params }, ctx) => {
        ctx.api.importLists.remove(params.id)
        emit(LIST_TOPICS.lists)
      },
      sync: ({ params }, ctx) => {
        ctx.api.importLists.sync(params.id)
        emit(LIST_TOPICS.lists)
      },
      test: ({ body }, ctx) => ctx.api.importLists.test(body.settings),
      traktConnect: (_, ctx) => {
        const code = ctx.api.importLists.traktConnect()
        return { ...code, expiresAt: wall(code.expiresAt) }
      },
      traktPoll: (_, ctx) => {
        const out = ctx.api.importLists.traktPoll()
        if (out.state === 'connected') emit(LIST_TOPICS.lists)
        return out
      },
      traktDisconnect: (_, ctx) => {
        ctx.api.importLists.traktDisconnect()
        emit(LIST_TOPICS.lists)
      },
      exclusions: (_, ctx) =>
        ctx.api.importLists.exclusions().map((e) => ({ ...e, createdAt: wall(e.createdAt) })),
      removeExclusion: ({ params }, ctx) => {
        ctx.api.importLists.removeExclusion(params.tmdbId)
        emit(LIST_TOPICS.lists)
      },
    },
    importers: {
      radarrTest: ({ body }, ctx) => ctx.api.importers.radarrTest(body),
      radarrPreview: ({ body }, ctx) => ctx.api.importers.radarrPreview(body),
      radarrRun: ({ body }, ctx) => {
        ctx.api.importers.radarrRun(body)
        emit(MIGRATION_TOPIC)
        const st = statusOf(ctx.api.importers.radarrStatus())
        follow(st.state)
        return st
      },
      radarrStatus: (_, ctx) => {
        const st = statusOf(ctx.api.importers.radarrStatus())
        follow(st.state)
        return st
      },
      qbittorrentTest: ({ body }, ctx) => ctx.api.importers.qbittorrentTest(body),
      // the mock's preview has no per-torrent list; the screen reads only its counts and folders
      qbittorrentPreview: ({ body }, ctx) => ({
        ...ctx.api.importers.qbittorrentPreview(body),
        list: [],
      }),
      qbittorrentRun: ({ body }, ctx) => {
        ctx.api.importers.qbittorrentRun(body)
        emit(MIGRATION_TOPIC)
        const st = qbtOf(ctx.api.importers.qbittorrentStatus())
        follow(st.state)
        return st
      },
      qbittorrentStatus: (_, ctx) => {
        const st = qbtOf(ctx.api.importers.qbittorrentStatus())
        follow(st.state)
        return st
      },
      qbittorrentResume: (_, ctx) => {
        ctx.api.importers.qbittorrentResume()
        emit(MIGRATION_TOPIC)
        return qbtOf(ctx.api.importers.qbittorrentStatus())
      },
    },
  }

  function qbtOf(st: QbittorrentImportStatus): QbittorrentImportStatus {
    return { ...statusOf(st), resumedAt: st.resumedAt && wall(st.resumedAt) }
  }
}
