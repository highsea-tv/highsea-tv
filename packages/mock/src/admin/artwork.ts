// SPDX-License-Identifier: AGPL-3.0-only
// The artwork routes (HT-66), answered from the mock: a library film's or a TMDB collection's
// poster, backdrop and logo, choosing another, uploading one and Reset, with the server's checks
// in its words (packages/metadata's artwork.ts) before the writes.
//
// What stands in for TMDB's images: the title's own art, then three more of each kind drawn the
// fixtures' way from the title's name, so the picker has a grid to choose from. An upload is kept
// as a data URL, and a film's choice is written to its art, so every page and app shows it. A
// collection's is kept beside the mock and laid over its art where `metadata.collection` answers.
import type { ArtworkKind, ArtworkKindView, ArtworkView } from '@highsea-tv/api-contract'
import { backdropArt, logoArt, posterArt } from '@highsea-tv/fixtures'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { checkArtwork } from '@highsea-tv/metadata/artwork-check'
import { tmdbNumber } from '../films.ts'
import { collectionRefs, collection as tmdbCollection } from '../metadata.ts'
import type { MediaItem } from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'

const t = createT(
  defineMessages({
    // packages/metadata, word for word
    notAnOption: 'TMDB has no such image for this title.',
    notInLibrary: 'That movie isn’t in the library.',
    tmdbCollection: 'TMDB has no collection with that id.',
  }),
)

const KINDS: ArtworkKind[] = ['poster', 'backdrop', 'logo']

/** A choice, as the server's `artwork` row keeps it. */
type Choice = {
  source: 'tmdb' | 'upload'
  file: string
  url: string
  language: string | null
  width: number | null
  height: number | null
  by: string
  at: number
}

/** Each kit's choices, by `owner:id:kind`, and a film's art before its first choice. */
const memories = new WeakMap<
  AdminKit,
  { choices: Map<string, Choice>; automatic: Map<string, MediaItem['art']> }
>()
const memoryOf = (kit: AdminKit) => {
  const known = memories.get(kit)
  if (known) return known
  const made = {
    choices: new Map<string, Choice>(),
    automatic: new Map<string, MediaItem['art']>(),
  }
  memories.set(kit, made)
  return made
}

/** A TMDB collection's art with the choices laid over it, for `metadata.collection`. */
export function chosenCollectionArt<A extends { poster: string | null; backdrop: string | null }>(
  kit: AdminKit,
  id: number,
  art: A,
): A & { logo: string | null } {
  const { choices } = memoryOf(kit)
  const url = (kind: ArtworkKind) => choices.get(`collection:${id}:${kind}`)?.url
  return {
    ...art,
    poster: url('poster') ?? art.poster,
    backdrop: url('backdrop') ?? art.backdrop,
    logo: url('logo') ?? null,
  }
}

type Option = { file: string; url: string; language: string | null; width: number; height: number }

const SIZES: Record<ArtworkKind, [number, number]> = {
  poster: [2000, 3000],
  backdrop: [3840, 2160],
  logo: [800, 310],
}
const LANGUAGES = ['en', null, 'en', 'de']

/** The title's own image first, then three more drawn from its name. */
function optionsOf(slug: string, name: string, kind: ArtworkKind, own: string | null): Option[] {
  const draw = kind === 'poster' ? posterArt : kind === 'backdrop' ? backdropArt : logoArt
  const [width, height] = SIZES[kind]
  return [own ?? draw(name), draw(`${name} 2`), draw(`${name} 3`), draw(`${name} 4`)].map(
    (url, i) => ({
      file: `/${slug}-${kind}-${i + 1}.jpg`,
      url,
      language: LANGUAGES[i] ?? null,
      width: width - i * 100,
      height: Math.round(((width - i * 100) * height) / width),
    }),
  )
}

export function artworkAnswers(kit: AdminKit): Answers {
  const memory = memoryOf(kit)
  const key = (owner: string, id: number, kind: ArtworkKind) => `${owner}:${id}:${kind}`

  /** The title's images: its name, a slug for the files, and each kind's automatic one. */
  function titleOf(ctx: Ctx, owner: 'movie' | 'collection', id: number) {
    if (owner === 'movie') {
      const m = ctx.srv.state.items.find((x) => x.type === 'movie' && x.tmdbId === id)
      if (!m) throw refuse('not-found', t('notInLibrary'))
      const before = memory.automatic.get(m.id) ?? m.art
      return {
        name: m.title,
        slug: `m${id}`,
        item: m,
        automatic: { poster: before.poster, backdrop: before.backdrop, logo: before.logo ?? null },
      }
    }
    const ref = collectionRefs().find((c) => tmdbNumber(c.id) === id)
    const c = ref ? tmdbCollection(ctx.srv.state, ref.id) : null
    if (!c) throw refuse('not-found', t('tmdbCollection'))
    const first = c.parts[0]
    return {
      name: c.name,
      slug: `c${id}`,
      item: null,
      automatic: {
        poster: first?.art.poster || null,
        backdrop: first?.art.backdrop || null,
        logo: null,
      },
    }
  }

  /** Writes a film's choices to its art, so every page and app draws them. */
  function apply(ctx: Ctx, owner: 'movie' | 'collection', id: number) {
    const title = titleOf(ctx, owner, id)
    if (title.item) {
      const m = title.item
      if (!memory.automatic.has(m.id)) memory.automatic.set(m.id, { ...m.art })
      const before = memory.automatic.get(m.id) as MediaItem['art']
      const url = (kind: ArtworkKind) => memory.choices.get(key(owner, id, kind))?.url
      m.art = {
        ...before,
        poster: url('poster') ?? before.poster,
        backdrop: url('backdrop') ?? before.backdrop,
        logo: url('logo') ?? before.logo,
      }
    }
    kit.emit('metadata.updated')
  }

  function view(ctx: Ctx, owner: 'movie' | 'collection', id: number): ArtworkView {
    const title = titleOf(ctx, owner, id)
    const users = ctx.srv.state.users
    const kinds = KINDS.map((kind): ArtworkKindView => {
      const chosen = memory.choices.get(key(owner, id, kind)) ?? null
      const automatic = title.automatic[kind]
      // TMDB keeps no logos for collections
      const options =
        owner === 'collection' && kind === 'logo'
          ? []
          : optionsOf(title.slug, title.name, kind, automatic)
      const current = chosen?.url ?? automatic ?? null
      const by = chosen ? users.find((u) => u.id === chosen.by) : undefined
      return {
        kind,
        current,
        automatic: automatic ?? null,
        chosen: chosen
          ? {
              source: chosen.source,
              by: by ? { id: by.id, name: by.username } : null,
              at: kit.wallMs(chosen.at),
              language: chosen.language,
              width: chosen.width,
              height: chosen.height,
            }
          : null,
        options: options.map((o) => ({
          ...o,
          voteAverage: 0,
          voteCount: 0,
          current: chosen ? chosen.file === o.file : o.url === automatic,
        })),
      }
    })
    return { owner, id, kinds, tmdb: { available: true, reason: null } }
  }

  return {
    artwork: {
      get: ({ params }, ctx) => view(ctx, params.owner, params.id),
      choose: ({ params, body }, ctx) => {
        const { owner, id, kind } = params
        const title = titleOf(ctx, owner, id)
        const option =
          owner === 'collection' && kind === 'logo'
            ? undefined
            : optionsOf(title.slug, title.name, kind, title.automatic[kind]).find(
                (o) => o.file === body.file,
              )
        if (!option) throw refuse('invalid', t('notAnOption'), { reason: 'not-an-option' })
        memory.choices.set(key(owner, id, kind), {
          source: 'tmdb',
          ...option,
          by: ctx.userId,
          at: ctx.srv.clock.now(),
        })
        apply(ctx, owner, id)
        return view(ctx, owner, id)
      },
      upload: ({ params, body }, ctx) => {
        const { owner, id, kind } = params
        titleOf(ctx, owner, id)
        const bytes = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0))
        // the server's checks, in its words
        let checked: ReturnType<typeof checkArtwork>
        try {
          checked = checkArtwork(kind, bytes)
        } catch (e) {
          const err = e as { message: string; details?: unknown }
          throw refuse('invalid', err.message, err.details)
        }
        memory.choices.set(key(owner, id, kind), {
          source: 'upload',
          file: `/hs_mock${ctx.srv.clock.now().toString(36)}`,
          url: `data:${checked.type};base64,${body.data}`,
          language: null,
          width: checked.width,
          height: checked.height,
          by: ctx.userId,
          at: ctx.srv.clock.now(),
        })
        apply(ctx, owner, id)
        return view(ctx, owner, id)
      },
      reset: ({ params }, ctx) => {
        const { owner, id, kind } = params
        titleOf(ctx, owner, id)
        if (memory.choices.delete(key(owner, id, kind))) apply(ctx, owner, id)
        return view(ctx, owner, id)
      },
    },
  } as Answers
}
