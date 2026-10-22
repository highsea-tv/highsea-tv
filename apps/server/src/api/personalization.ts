// SPDX-License-Identifier: AGPL-3.0-only
// Personalization over HTTP: thin handlers over @highsea-tv/personalization (ADR 0027, 0028).
import { MARK_UPLOAD_MAX, routes } from '@highsea-tv/api-contract'
import { isStaff } from '@highsea-tv/auth'
import { AppError } from '@highsea-tv/core'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { actor, type Env, me } from './guard.ts'

/** Sound pack recipes are a few kilobytes; this leaves room and no more. */
const SOUND_PACK_MAX = 256 * 1024

/**
 * Refuses a body over `max` bytes before it's read (Hono, Body Limit Middleware). The JSON
 * envelope around the mark's base64 is small; a kilobyte covers it.
 */
const limit = (max: number) =>
  bodyLimit({
    maxSize: max + 1024,
    onError: () => {
      throw new AppError('invalid', 'That file is too large.', { reason: 'size' })
    },
  })

export function registerPersonalization(app: OpenAPIHono<Env>) {
  const p13n = (c: Context<Env>) => c.get('runtime').personalization
  // the dashboard routes are staff's (ADR 0032), so the guard has already turned a user away
  const person = (c: Context<Env>) => {
    const { user } = me(c)
    if (!isStaff(user.role)) throw new AppError('forbidden', 'You don’t have access to that.')
    return { id: user.id, role: user.role as 'owner' | 'admin' }
  }
  const audit = (c: Context<Env>, action: string, target?: { type: string; id: string }) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      ...(target ? { targetType: target.type, targetId: target.id } : {}),
    })

  // ---------------------------------------------------------------- dashboard

  app.openapi(routes.dashboard.layout, (c) => c.json(p13n(c).dashboard.layout(person(c)), 200))

  app.openapi(routes.dashboard.saveLayout, (c) =>
    c.json(p13n(c).dashboard.save(person(c), c.req.valid('json').widgets), 200),
  )

  app.openapi(routes.dashboard.resetLayout, (c) => c.json(p13n(c).dashboard.reset(person(c)), 200))

  app.openapi(routes.dashboard.roleDefault, (c) =>
    c.json(p13n(c).dashboard.roleDefault(c.req.valid('param').role), 200),
  )

  app.openapi(routes.dashboard.saveRoleDefault, (c) => {
    const { role } = c.req.valid('param')
    const saved = p13n(c).dashboard.saveRoleDefault(role, c.req.valid('json').widgets)
    audit(c, 'dashboard.role-default', { type: 'role', id: role })
    return c.json(saved, 200)
  })

  // ---------------------------------------------------------------- preferences

  app.openapi(routes.preferences.get, (c) => {
    const p = me(c)
    return c.json(p13n(c).preferences.resolve(p.user.id, p.deviceId), 200)
  })

  app.openapi(routes.preferences.save, (c) => {
    const p = me(c)
    const { layer, client, values } = c.req.valid('json')
    if (layer === 'client' && !client)
      throw new AppError('invalid', 'Say which kind of app the layer is for.', {
        reason: 'client',
      })
    return c.json(p13n(c).preferences.save(p.user.id, p.deviceId, layer, values, client), 200)
  })

  app.openapi(routes.preferences.device, (c) => {
    const device = c.get('runtime').auth.devices.find(c.req.valid('param').id)
    if (!device) throw new AppError('not-found', 'There’s no device with that id.')
    return c.json(p13n(c).preferences.resolve(device.userId, device.id), 200)
  })

  // ---------------------------------------------------------------- home

  app.openapi(routes.home.layout, (c) => c.json(p13n(c).home.layout(me(c).user.id), 200))

  app.openapi(routes.home.saveLayout, (c) =>
    c.json(p13n(c).home.save(me(c).user.id, c.req.valid('json')), 200),
  )

  // ---------------------------------------------------------------- appearance

  app.openapi(routes.appearance.get, (c) => c.json(p13n(c).appearance.get(), 200))

  app.openapi(routes.appearance.save, (c) => {
    const view = p13n(c).appearance.save(c.req.valid('json'))
    audit(c, 'settings.appearance')
    return c.json(view, 200)
  })

  app.openapi(routes.appearance.saveTheme, (c) => {
    const { id } = c.req.valid('param')
    const theme = p13n(c).appearance.saveTheme(id, c.req.valid('json'))
    audit(c, 'appearance.theme-saved', { type: 'theme', id })
    return c.json(theme, 200)
  })

  app.openapi(routes.appearance.deleteTheme, (c) => {
    const { id } = c.req.valid('param')
    p13n(c).appearance.deleteTheme(id)
    audit(c, 'appearance.theme-deleted', { type: 'theme', id })
    return c.body(null, 204)
  })

  // the mark is bytes, not JSON: served with its own headers, listed in the document from the
  // contract
  app.get(routes.appearance.mark.path, (c) => {
    const mark = p13n(c).appearance.mark()
    if (!mark) throw new AppError('not-found', 'This server uses the highsea mark.')
    const etag = `"${mark.hash}"`
    const headers: Record<string, string> = {
      ETag: etag,
      // the URL apps use is versioned by content; revalidating keeps an unversioned one fresh
      'Cache-Control': 'no-cache',
      // MDN, X-Content-Type-Options: the browser keeps to the declared type
      'X-Content-Type-Options': 'nosniff',
    }
    // an SVG opened by its URL could run script; the sandbox stops that (MDN, CSP sandbox)
    if (mark.type === 'image/svg+xml')
      headers['Content-Security-Policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'"
    // RFC 9110 § 13.1.2: a weak comparison against every tag the client lists
    const match = c.req.header('if-none-match')
    if (match?.split(',').some((t) => t.trim().replace(/^W\//, '') === etag))
      return c.body(null, 304, headers)
    return c.body(new Uint8Array(mark.data), 200, { ...headers, 'Content-Type': mark.type })
  })
  app.openAPIRegistry.registerPath(routes.appearance.mark)

  app.use(routes.appearance.uploadMark.path, async (c, next) =>
    c.req.method === 'PUT' ? limit(MARK_UPLOAD_MAX)(c, next) : next(),
  )
  app.openapi(routes.appearance.uploadMark, (c) => {
    const bytes = Buffer.from(c.req.valid('json').data, 'base64')
    const branding = p13n(c).appearance.setMark(new Uint8Array(bytes))
    audit(c, 'appearance.mark-uploaded')
    return c.json(branding, 200)
  })

  app.openapi(routes.appearance.removeMark, (c) => {
    const branding = p13n(c).appearance.removeMark()
    audit(c, 'appearance.mark-removed')
    return c.json(branding, 200)
  })

  app.openapi(routes.appearance.soundPack, (c) =>
    c.json(p13n(c).appearance.soundPack(c.req.valid('param').id), 200),
  )

  app.use(routes.appearance.uploadSoundPack.path, limit(SOUND_PACK_MAX))
  app.openapi(routes.appearance.uploadSoundPack, (c) => {
    const pack = p13n(c).appearance.uploadSoundPack(c.req.valid('json'))
    audit(c, 'appearance.sound-pack-saved', { type: 'sound-pack', id: pack.id })
    return c.json(pack, 200)
  })

  app.openapi(routes.appearance.deleteSoundPack, (c) => {
    const { id } = c.req.valid('param')
    p13n(c).appearance.deleteSoundPack(id)
    audit(c, 'appearance.sound-pack-deleted', { type: 'sound-pack', id })
    return c.body(null, 204)
  })
}
