// SPDX-License-Identifier: AGPL-3.0-only
// The owner's tools over HTTP (checkpoint 8b, ADR 0047): backups and restore, the log, crash
// reports, updates, /metrics, and their settings: General, Backups and Metrics.
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { routes } from '@highsea/api-contract'
import { isStaff } from '@highsea/auth'
import { AppError, iso, jsonLine, type LogEntry } from '@highsea/core'
import { type Backup, METRICS_CONTENT_TYPE } from '@highsea/runtime'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

const backupView = (b: Backup) => ({
  id: b.id,
  kind: b.kind,
  createdAt: iso(b.createdAt),
  size: b.size,
  version: b.version,
  schema: b.schema,
  problem: b.problem,
})

/** A log entry as JSON gives it: an Error in the fields becomes its message and stack. */
const entryView = (e: LogEntry) => {
  const plain = JSON.parse(jsonLine(e)) as LogEntry
  return { ...plain, at: iso(e.at) }
}

/** Files one after another as a web stream, so a large backup or log isn't read into memory. */
const streamOf = (paths: string[]) =>
  Readable.toWeb(
    Readable.from(
      (async function* () {
        for (const path of paths) yield* createReadStream(path)
      })(),
    ),
  ) as unknown as ReadableStream

/** RFC 6266: a download's file name; ours are ASCII, so the plain parameter is enough. */
const attachment = (name: string) => ({
  'content-disposition': `attachment; filename="${name}"`,
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
})

export function registerOperations(app: OpenAPIHono<Env>) {
  const ops = (c: Context<Env>) => c.get('runtime').operations
  const audit = (c: Context<Env>, action: string, target?: string) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      ...(target ? { targetType: 'backup', targetId: target } : {}),
      address: c.get('meta').address,
    })

  // ---------------------------------------------------------------- backups

  app.openapi(routes.system.backups, async (c) => {
    const next = ops(c).backups.nextRun()
    return c.json(
      {
        backups: (await ops(c).backups.list()).map(backupView),
        nextRun: next === null ? null : iso(next),
      },
      200,
    )
  })

  app.openapi(routes.system.backupNow, async (c) => {
    const made = await ops(c).backups.backUp()
    audit(c, 'backups.created', made.id)
    return c.json(backupView(made), 201)
  })

  app.openapi(routes.system.downloadBackup, (c) => {
    const { id } = c.req.valid('param')
    const path = ops(c).backups.path(id)
    return c.body(streamOf([path]), 200, {
      'content-type': 'application/zip',
      ...attachment(`${id}.zip`),
    }) as never
  })

  app.openapi(routes.system.deleteBackup, async (c) => {
    const { id } = c.req.valid('param')
    await ops(c).backups.remove(id)
    audit(c, 'backups.deleted', id)
    return c.body(null, 204)
  })

  app.openapi(routes.system.restore, async (c) => {
    const { id } = c.req.valid('param')
    // audited first: the restored database won't have this line, the one set aside will
    audit(c, 'backups.restored', id)
    await ops(c).backups.restore(id)
    return c.body(null, 202)
  })

  // ---------------------------------------------------------------- the log and crash reports

  app.openapi(routes.system.logs, (c) =>
    c.json(
      {
        entries: ops(c).logs.query(c.req.valid('query')).map(entryView),
        files: ops(c).logs.files(),
      },
      200,
    ),
  )

  app.openapi(routes.system.downloadLogs, (c) => {
    const day = new Date(c.get('runtime').clock.now()).toISOString().slice(0, 10)
    return c.body(streamOf(ops(c).logs.paths()), 200, {
      'content-type': 'application/x-ndjson',
      ...attachment(`highsea-logs-${day}.jsonl`),
    }) as never
  })

  app.openapi(routes.system.crashes, (c) =>
    c.json(
      ops(c)
        .crashes.list()
        .map((r) => ({ ...r, at: iso(r.at) })),
      200,
    ),
  )

  app.openapi(routes.system.crash, (c) => {
    const { id } = c.req.valid('param')
    const path = ops(c).crashes.path(id)
    return c.body(streamOf([path]), 200, {
      'content-type': 'application/json',
      ...attachment(`${id}.json`),
    }) as never
  })

  // ---------------------------------------------------------------- updates and /metrics

  app.openapi(routes.system.updates, (c) => {
    const u = ops(c).updates()
    return c.json({ ...u, checkedAt: u.checkedAt === null ? null : iso(u.checkedAt) }, 200)
  })

  app.openapi(routes.system.metrics, (c) => {
    if (!ops(c).metrics.enabled())
      throw new AppError('not-found', 'Metrics are off. Turn them on in Settings › General.')
    // an API key held by the owner or an admin (the contract's description); the guard has
    // already authenticated the bearer, if there was one
    const p = c.get('principal')
    if (p?.via !== 'key')
      throw new AppError('unauthorized', 'Metrics take an API key as a bearer token.', {
        reason: 'api-key-required',
      })
    if (!isStaff(p.user.role)) throw new AppError('forbidden', 'You don’t have access to that.')
    return c.body(ops(c).metrics.render(), 200, {
      'content-type': METRICS_CONTENT_TYPE,
      'cache-control': 'no-store',
    }) as never
  })

  // ---------------------------------------------------------------- settings

  app.openapi(routes.settings.general, (c) => c.json(ops(c).general.get(), 200))

  app.openapi(routes.settings.saveGeneral, (c) => {
    const saved = ops(c).general.update(c.req.valid('json'))
    audit(c, 'settings.general')
    return c.json(saved, 200)
  })

  app.openapi(routes.settings.backups, (c) => c.json(ops(c).backups.settings(), 200))

  app.openapi(routes.settings.saveBackups, (c) => {
    const saved = ops(c).backups.updateSettings(c.req.valid('json'))
    audit(c, 'settings.backups')
    return c.json(saved, 200)
  })

  app.openapi(routes.settings.metrics, (c) => c.json(ops(c).metrics.settings(), 200))

  app.openapi(routes.settings.saveMetrics, (c) => {
    const saved = ops(c).metrics.updateSettings(c.req.valid('json'))
    audit(c, 'settings.metrics')
    return c.json(saved, 200)
  })
}
