// SPDX-License-Identifier: AGPL-3.0-only
// The one-time importers over HTTP (checkpoint 6b; ADR 0041): Settings › Migration. Thin handlers
// over @highsea/importers; the contract keeps every route the owner's. Starting an import and
// resuming the torrents brought across go in the audit log; the credentials never do.
import { type ImportStatus, type QbittorrentImportStatus, routes } from '@highsea/api-contract'
import type { QbtStatus } from '@highsea/importers/qbittorrent'
import type { MigrationState } from '@highsea/importers/radarr'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

const view = ({ jobId: _job, startedAt, finishedAt, ...rest }: MigrationState) =>
  ({ ...rest, startedAt: iso(startedAt), finishedAt: iso(finishedAt) }) satisfies ImportStatus

const qbtView = ({ torrentIds: _ids, resumedAt, ...rest }: QbtStatus) =>
  ({
    ...view(rest),
    paused: rest.paused,
    checking: rest.checking,
    resumedAt: iso(resumedAt),
  }) satisfies QbittorrentImportStatus

export function registerImporters(app: OpenAPIHono<Env>) {
  const runtime = (c: Context<Env>) => c.get('runtime')
  const audit = (c: Context<Env>, action: string, targetId: string) =>
    runtime(c).auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: 'importer',
      targetId,
    })

  app.openapi(routes.importers.radarrTest, async (c) =>
    c.json(await runtime(c).importers.radarr.connect(c.req.valid('json')), 200),
  )

  app.openapi(routes.importers.radarrPreview, async (c) => {
    const { pathMappings, ...conn } = c.req.valid('json')
    return c.json(await runtime(c).importers.radarr.preview(conn, pathMappings), 200)
  })

  app.openapi(routes.importers.radarrRun, (c) => {
    const { url, apiKey, ...options } = c.req.valid('json')
    const state = runtime(c).importers.radarr.run({ url, apiKey }, options)
    audit(c, 'import.radarr', url)
    return c.json(view(state), 200)
  })

  app.openapi(routes.importers.radarrStatus, (c) =>
    c.json(view(runtime(c).importers.radarr.status()), 200),
  )

  app.openapi(routes.importers.qbittorrentTest, async (c) =>
    c.json(await runtime(c).importers.qbittorrent.connect(c.req.valid('json')), 200),
  )

  app.openapi(routes.importers.qbittorrentPreview, async (c) => {
    const { pathMappings, ...conn } = c.req.valid('json')
    return c.json(await runtime(c).importers.qbittorrent.preview(conn, pathMappings), 200)
  })

  app.openapi(routes.importers.qbittorrentRun, (c) => {
    const { pathMappings, ...conn } = c.req.valid('json')
    runtime(c).importers.qbittorrent.run(conn, { pathMappings })
    audit(c, 'import.qbittorrent', conn.url)
    return c.json(qbtView(runtime(c).importers.qbittorrent.status()), 200)
  })

  app.openapi(routes.importers.qbittorrentStatus, (c) =>
    c.json(qbtView(runtime(c).importers.qbittorrent.status()), 200),
  )

  app.openapi(routes.importers.qbittorrentResume, (c) => {
    const status = runtime(c).importers.qbittorrent.resume()
    audit(c, 'import.qbittorrent.resume', String(status.torrentIds.length))
    return c.json(qbtView(status), 200)
  })
}
