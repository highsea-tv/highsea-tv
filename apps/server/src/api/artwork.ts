// SPDX-License-Identifier: AGPL-3.0-only
// Chosen artwork (HT-66): the picker's view of a title's poster, backdrop and logo, choosing another
// of TMDB's or fanart.tv's (HT-74), uploading one, and Reset. Thin handlers over @highsea-tv/metadata's `artwork`; staff
// only, enforced by the guard from the contract (ADR 0032). Each change goes to the audit log.
import {
  type ArtworkKindView as ApiKind,
  ARTWORK_UPLOAD_MAX,
  type ArtworkView,
  routes,
} from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import {
  type ArtworkKindView,
  type ArtworkOwner,
  imageUrl,
  isFanartFile,
} from '@highsea-tv/metadata'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { actor, type Env, me } from './guard.ts'

/** The picker's sizes: the grid's tiles, and the larger "Now showing". */
const GRID = { poster: 'w185', backdrop: 'w300', logo: 'w185' } as const
const SHOWN = { poster: 'w342', backdrop: 'w780', logo: 'w300' } as const

export function registerArtwork(app: OpenAPIHono<Env>) {
  const md = (c: Context<Env>) => c.get('runtime').metadata
  const audit = (
    c: Context<Env>,
    action: string,
    owner: ArtworkOwner,
    id: number,
    detail: Record<string, unknown>,
  ) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: owner,
      targetId: String(id),
      detail,
    })

  async function view(c: Context<Env>, owner: ArtworkOwner, id: number): Promise<ArtworkView> {
    const { kinds, optionsError } = await md(c).artwork.view(owner, id)
    const by = new Set(kinds.flatMap((k) => (k.choice?.chosenBy ? [k.choice.chosenBy] : [])))
    const names = new Map(
      by.size
        ? c
            .get('runtime')
            .auth.ctx.userViews([...by])
            .map((u) => [u.id, u.username])
        : [],
    )
    const url = (k: ArtworkKindView, size: string, file: string | null) =>
      imageUrl(owner, id, k.kind, size, file)
    return {
      owner,
      id,
      kinds: kinds.map(
        (k): ApiKind => ({
          kind: k.kind,
          current: url(k, SHOWN[k.kind], k.current),
          automatic: url(k, SHOWN[k.kind], k.automatic),
          chosen: k.choice
            ? {
                source: k.choice.source,
                by:
                  k.choice.chosenBy && names.has(k.choice.chosenBy)
                    ? { id: k.choice.chosenBy, name: names.get(k.choice.chosenBy) as string }
                    : null,
                at: new Date(k.choice.chosenAt).toISOString(),
                language: k.choice.language,
                width: k.choice.width,
                height: k.choice.height,
              }
            : null,
          options: k.options.flatMap((o) => {
            const u = url(k, GRID[k.kind], o.file)
            return u ? [{ ...o, url: u, current: o.file === k.current }] : []
          }),
        }),
      ),
      tmdb: {
        available: !optionsError,
        reason: optionsError
          ? ((optionsError.details as { reason?: string } | undefined)?.reason ?? optionsError.code)
          : null,
      },
    }
  }

  app.openapi(routes.artwork.get, async (c) => {
    const { owner, id } = c.req.valid('param')
    return c.json(await view(c, owner, id), 200)
  })

  app.openapi(routes.artwork.choose, async (c) => {
    const { owner, id, kind } = c.req.valid('param')
    const { file } = c.req.valid('json')
    await md(c).artwork.choose(owner, id, kind, file, me(c).user.id)
    audit(c, 'artwork.chosen', owner, id, {
      kind,
      source: isFanartFile(file) ? 'fanart' : 'tmdb',
      file,
    })
    return c.json(await view(c, owner, id), 200)
  })

  // the size is refused before the body is read (ADR 0028's mark, Hono's Body Limit)
  app.use(
    routes.artwork.upload.path.replace(/\{(\w+)\}/g, ':$1'),
    bodyLimit({
      maxSize: ARTWORK_UPLOAD_MAX + 1024,
      onError: () => {
        throw new AppError('invalid', 'That file is larger than 10 MB.', { reason: 'size' })
      },
    }),
  )
  app.openapi(routes.artwork.upload, async (c) => {
    const { owner, id, kind } = c.req.valid('param')
    const bytes = new Uint8Array(Buffer.from(c.req.valid('json').data, 'base64'))
    const file = await md(c).artwork.upload(owner, id, kind, bytes, me(c).user.id)
    audit(c, 'artwork.uploaded', owner, id, { kind, source: 'upload', file })
    return c.json(await view(c, owner, id), 200)
  })

  app.openapi(routes.artwork.reset, async (c) => {
    const { owner, id, kind } = c.req.valid('param')
    if (md(c).artwork.reset(owner, id, kind)) audit(c, 'artwork.reset', owner, id, { kind })
    return c.json(await view(c, owner, id), 200)
  })
}
