// SPDX-License-Identifier: AGPL-3.0-only
// Curation over HTTP (curation.md; checkpoint 8c, ADR 0048): thin handlers over
// `@highsea-tv/curation`. The admin's routes are staff only (ADR 0032); the home screen and the
// announcements are every signed-in person's, resolved for them and the kind of app asking.
// Static paths (`/sections/order`, `/sections/resolve`) come before `/{id}`, in the contract's
// order. Changes go in the audit log, as settings do.
import { routes } from '@highsea-tv/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

export function registerCuration(app: OpenAPIHono<Env>) {
  const curation = (c: Context<Env>) => c.get('runtime').curation
  const audit = (c: Context<Env>, action: string, targetType: string, id: string) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType,
      targetId: id,
    })

  // ------------------------------------------------------------ announcements

  app.openapi(routes.curation.announcements, (c) => c.json(curation(c).announcements(), 200))

  app.openapi(routes.curation.addAnnouncement, (c) => {
    const added = curation(c).addAnnouncement(c.req.valid('json'), me(c).user.id)
    audit(c, 'announcement.added', 'announcement', added.id)
    return c.json(added, 201)
  })

  app.openapi(routes.curation.announcement, (c) =>
    c.json(curation(c).announcement(c.req.valid('param').id), 200),
  )

  app.openapi(routes.curation.saveAnnouncement, (c) => {
    const { id } = c.req.valid('param')
    const saved = curation(c).saveAnnouncement(id, c.req.valid('json'))
    audit(c, 'announcement.updated', 'announcement', id)
    return c.json(saved, 200)
  })

  app.openapi(routes.curation.endAnnouncement, (c) => {
    const { id } = c.req.valid('param')
    curation(c).endAnnouncement(id)
    audit(c, 'announcement.ended', 'announcement', id)
    return c.body(null, 204)
  })

  app.openapi(routes.curation.removeAnnouncement, (c) => {
    const { id } = c.req.valid('param')
    curation(c).removeAnnouncement(id)
    audit(c, 'announcement.removed', 'announcement', id)
    return c.body(null, 204)
  })

  // ----------------------------------------------------------------- sections

  app.openapi(routes.curation.sections, (c) => c.json(curation(c).sections(), 200))

  app.openapi(routes.curation.addSection, (c) => {
    const added = curation(c).addSection(c.req.valid('json'))
    audit(c, 'featured-section.added', 'featured-section', added.id)
    return c.json(added, 201)
  })

  app.openapi(routes.curation.orderSections, (c) => {
    curation(c).orderSections(c.req.valid('json').ids)
    audit(c, 'featured-section.reordered', 'featured-section', 'order')
    return c.body(null, 204)
  })

  app.openapi(routes.curation.resolve, (c) =>
    c.json(curation(c).resolve(c.req.valid('json').source, me(c).user.id), 200),
  )

  app.openapi(routes.curation.section, (c) =>
    c.json(curation(c).section(c.req.valid('param').id), 200),
  )

  app.openapi(routes.curation.saveSection, (c) => {
    const { id } = c.req.valid('param')
    const saved = curation(c).saveSection(id, c.req.valid('json'))
    audit(c, 'featured-section.updated', 'featured-section', id)
    return c.json(saved, 200)
  })

  app.openapi(routes.curation.removeSection, (c) => {
    const { id } = c.req.valid('param')
    curation(c).removeSection(id)
    audit(c, 'featured-section.removed', 'featured-section', id)
    return c.body(null, 204)
  })

  app.openapi(routes.curation.ruleOptions, (c) => c.json(curation(c).ruleOptions(), 200))

  app.openapi(routes.curation.preview, (c) => c.json(curation(c).preview(c.req.valid('json')), 200))

  // ----------------------------------------------------- the apps' own reads

  app.openapi(routes.home.sections, (c) =>
    c.json(curation(c).home(me(c).user.id, c.req.valid('query').client ?? 'web'), 200),
  )

  app.openapi(routes.announcements.active, (c) =>
    c.json(
      curation(c).activeAnnouncements(me(c).user.id, c.req.valid('query').client ?? 'web'),
      200,
    ),
  )

  app.openapi(routes.announcements.seen, (c) => {
    curation(c).seen(c.req.valid('param').id, me(c).user.id)
    return c.body(null, 204)
  })
}
