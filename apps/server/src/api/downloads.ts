// SPDX-License-Identifier: AGPL-3.0-only
// Downloading and importing over HTTP (checkpoint 6a): Activity's queue, history and blocklist,
// Downloads, manual import and the folder browser, a movie's grab, files and history, Settings ›
// Media management, › Download client and › VPN, and System's rates. Thin handlers over
// @highsea/downloads, @highsea/media and @highsea/vpn; what changes things goes in the audit log.
// `/torrents/limits`, `/pauseAll` and `/resumeAll` are registered before `/torrents/{id}`.
import { routes } from '@highsea/api-contract'
import { AppError } from '@highsea/core'
import type { ImportResult } from '@highsea/media/movies'
import { providerById, vpnProviders } from '@highsea/vpn'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

/** Media's `itemId` is the movie's TMDB id; the API calls it `movieId`, beside downloads'. */
const withMovieId = <T extends { itemId: number }>({ itemId, ...rest }: T) => ({
  ...rest,
  movieId: itemId,
})

const outcome = (path: string, r: ImportResult) =>
  r.status === 'imported'
    ? { path, ok: true, message: `${r.path} · ${r.message}` }
    : { path, ok: false, message: r.reason }

export function registerDownloads(app: OpenAPIHono<Env>) {
  const runtime = (c: Context<Env>) => c.get('runtime')
  const audit = (c: Context<Env>, action: string, target?: { type: string; id: string }) =>
    runtime(c).auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      ...(target ? { targetType: target.type, targetId: target.id } : {}),
    })
  const download = (id: string) => ({ type: 'download', id })
  const torrent = (id: string) => ({ type: 'torrent', id })

  // ---------------------------------------------------------------- the queue

  app.openapi(routes.queue.list, (c) => c.json(runtime(c).downloads.queue(), 200))

  app.openapi(routes.queue.pause, (c) =>
    c.json(runtime(c).downloads.pause(c.req.valid('param').id), 200),
  )

  app.openapi(routes.queue.resume, (c) =>
    c.json(runtime(c).downloads.resume(c.req.valid('param').id), 200),
  )

  app.openapi(routes.queue.forceImport, (c) => {
    const { id } = c.req.valid('param')
    const item = runtime(c).downloads.forceImport(id)
    audit(c, 'download.force-imported', download(id))
    return c.json(item, 200)
  })

  app.openapi(routes.queue.searchAlternative, async (c) => {
    const { id } = c.req.valid('param')
    await runtime(c).downloads.searchAlternative(id, c.req.valid('json').reason)
    audit(c, 'download.replaced', download(id))
    return c.body(null, 204)
  })

  app.openapi(routes.queue.remove, async (c) => {
    const { id } = c.req.valid('param')
    const { deleteData, blocklist } = c.req.valid('json')
    await runtime(c).downloads.remove(id, { deleteData, blocklist })
    audit(c, 'download.removed', download(id))
    return c.body(null, 204)
  })

  // ---------------------------------------------------------------- history and the blocklist

  app.openapi(routes.history.list, (c) => {
    const page = runtime(c).media.history.list(c.req.valid('query').cursor)
    return c.json({ items: page.items.map(withMovieId), next: page.next }, 200)
  })

  app.openapi(routes.history.clear, (c) => {
    const { media, events } = runtime(c)
    media.history.clear()
    events.emit({ topic: 'history.updated' })
    audit(c, 'history.cleared')
    return c.body(null, 204)
  })

  app.openapi(routes.blocklist.list, (c) => c.json(runtime(c).downloads.blocklist(), 200))

  app.openapi(routes.blocklist.remove, (c) => {
    const { id } = c.req.valid('param')
    runtime(c).downloads.unblock(id)
    audit(c, 'blocklist.removed', { type: 'blocklist', id })
    return c.body(null, 204)
  })

  // ---------------------------------------------------------------- Downloads

  app.openapi(routes.downloads.list, (c) => c.json(runtime(c).downloads.torrents(), 200))

  app.openapi(routes.downloads.limits, (c) => c.json(runtime(c).downloads.limits(), 200))

  app.openapi(routes.downloads.setLimits, (c) => {
    const limits = runtime(c).downloads.setLimits(c.req.valid('json'))
    audit(c, 'downloads.limits-changed')
    return c.json(limits, 200)
  })

  app.openapi(routes.downloads.pauseAll, (c) => {
    runtime(c).downloads.pauseAll()
    return c.body(null, 204)
  })

  app.openapi(routes.downloads.resumeAll, (c) => {
    runtime(c).downloads.resumeAll()
    return c.body(null, 204)
  })

  app.openapi(routes.downloads.get, (c) =>
    c.json(runtime(c).downloads.torrent(c.req.valid('param').id), 200),
  )

  app.openapi(routes.downloads.add, async (c) => {
    const { urlOrMagnet, torrent: file, paused } = c.req.valid('json')
    const link = urlOrMagnet?.trim() ?? ''
    const source = file
      ? { torrent: new Uint8Array(Buffer.from(file, 'base64')) }
      : link.startsWith('magnet:')
        ? { magnet: link }
        : /^https?:\/\//i.test(link)
          ? { url: link }
          : null
    if (!source)
      throw new AppError('invalid', 'That isn’t a magnet link or an address.', {
        field: 'urlOrMagnet',
      })
    const added = await runtime(c).downloads.add({ source, paused })
    audit(c, 'torrent.added', torrent(added.id))
    return c.json(added, 201)
  })

  app.openapi(routes.downloads.delete, async (c) => {
    const { id } = c.req.valid('param')
    await runtime(c).downloads.deleteTorrent(id, c.req.valid('json').deleteData)
    audit(c, 'torrent.removed', torrent(id))
    return c.body(null, 204)
  })

  app.openapi(routes.downloads.pause, (c) => {
    const { id } = c.req.valid('param')
    const { downloads } = runtime(c)
    downloads.pauseTorrent(id)
    return c.json(downloads.torrent(id), 200)
  })

  app.openapi(routes.downloads.resume, (c) => {
    const { id } = c.req.valid('param')
    const { downloads } = runtime(c)
    downloads.resumeTorrent(id)
    return c.json(downloads.torrent(id), 200)
  })

  app.openapi(routes.downloads.setFilePriority, (c) => {
    const { id } = c.req.valid('param')
    const { path, priority } = c.req.valid('json')
    return c.json(runtime(c).downloads.setFilePriority(id, path, priority), 200)
  })

  // ---------------------------------------------------------------- manual import

  app.openapi(routes.fs.list, (c) => c.json(runtime(c).browse(c.req.valid('query').path), 200))

  app.openapi(routes.manualImport.scan, async (c) => {
    const found = await runtime(c).movies.manualImport.scan(c.req.valid('json').path)
    return c.json(
      found.map(({ itemId, ...rest }) => ({ ...rest, movieId: itemId })),
      200,
    )
  })

  app.openapi(routes.manualImport.run, async (c) => {
    const { files, mode } = c.req.valid('json')
    const done = await runtime(c).movies.manualImport.run(
      files.map((f) => ({ path: f.path, itemId: f.movieId, versionId: f.versionId })),
      mode,
    )
    audit(c, 'import.manual', { type: 'files', id: String(files.length) })
    return c.json({ results: done.map((d) => outcome(d.path, d.result)) }, 200)
  })

  // ---------------------------------------------------------------- a movie's downloads side

  app.openapi(routes.movies.grabRelease, async (c) => {
    const { id, guid } = c.req.valid('param')
    const { indexerId, versionId, force } = c.req.valid('json')
    const rt = runtime(c)
    const item = await rt.downloads.grab({
      itemId: rt.itemId(id),
      versionId: versionId ?? null,
      indexerId,
      guid,
      force,
    })
    audit(c, force ? 'release.grabbed-anyway' : 'release.grabbed', {
      type: 'movie',
      id: String(id),
    })
    return c.json(item, 200)
  })

  app.openapi(routes.movies.files, (c) =>
    c.json(runtime(c).movies.files(c.req.valid('param').id).map(withMovieId), 200),
  )

  app.openapi(routes.movies.history, (c) => {
    const page = runtime(c).movies.history(c.req.valid('param').id, c.req.valid('query').cursor)
    return c.json({ items: page.items.map(withMovieId), next: page.next }, 200)
  })

  // ---------------------------------------------------------------- settings

  app.openapi(routes.settings.mediaManagement, (c) =>
    c.json(runtime(c).media.mediaManagement.get(), 200),
  )

  app.openapi(routes.settings.saveMediaManagement, (c) => {
    const { media, events } = runtime(c)
    const saved = media.mediaManagement.save(c.req.valid('json'))
    events.emit({ topic: 'settings.updated' })
    audit(c, 'settings.media-management-changed')
    return c.json(saved, 200)
  })

  app.openapi(routes.settings.downloadClient, (c) => c.json(runtime(c).downloads.settings(), 200))

  app.openapi(routes.settings.saveDownloadClient, async (c) => {
    const saved = await runtime(c).downloads.saveSettings(c.req.valid('json'))
    audit(c, 'settings.download-client-changed')
    return c.json(saved, 200)
  })

  // ---------------------------------------------------------------- VPN

  app.openapi(routes.vpn.status, (c) => c.json(runtime(c).vpn.status(), 200))

  app.openapi(routes.vpn.check, async (c) => c.json(await runtime(c).vpn.check(), 200))

  app.openapi(routes.vpn.reconnect, async (c) => {
    const status = await runtime(c).vpn.reconnect()
    audit(c, 'vpn.reconnected')
    return c.json(status, 200)
  })

  app.openapi(routes.vpn.providers, (c) => c.json(vpnProviders, 200))

  app.openapi(routes.vpn.interfaces, (c) => c.json(runtime(c).vpn.interfaces(), 200))

  app.openapi(routes.vpn.compose, (c) => {
    const input = c.req.valid('json')
    if (!providerById(input.provider))
      throw new AppError('invalid', 'That provider isn’t one highsea knows.', { field: 'provider' })
    return c.json({ yaml: runtime(c).vpn.compose(input) }, 200)
  })

  app.openapi(routes.vpn.settings, (c) => c.json(runtime(c).vpn.settings(), 200))

  app.openapi(routes.vpn.save, async (c) => {
    const saved = await runtime(c).vpn.save(c.req.valid('json'))
    audit(c, 'settings.vpn-changed')
    return c.json(saved, 200)
  })

  // ---------------------------------------------------------------- System

  app.openapi(routes.system.speeds, (c) => c.json(runtime(c).downloads.speeds(), 200))
}
