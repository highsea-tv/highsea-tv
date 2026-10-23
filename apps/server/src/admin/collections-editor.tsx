'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The collection editor (collections.md#the-editor; checkpoint 8d), ported from the prototype's
// collections/editor.tsx: name, summary and artwork; rules or films picked by hand; Always include
// and Never include; sort, limit and who sees it. Beside it, what the draft holds right now
// (`POST /curation/collections/preview`, as the draft settles): both counts, the rules in words and
// the posters.
//
// What real data changes:
// - the server has no upload for a collection's poster, so Artwork chooses one of the posters it
//   holds, or the mosaic, as 8c's announcement image chooses a backdrop;
// - the live result leaves out conditions still being filled in, and a draft without a name is
//   previewed under the form's own name, since the server checks a draft as it would a save;
// - titles are addressed by TMDB id; picked titles the result doesn't show (Never include's) are
//   named from the library (`GET /movies/{id}`).
import type {
  CollectionPreview,
  CollectionSummary,
  Movie,
  RuleGroup,
  SmartCollectionInput,
} from '@highsea-tv/api-contract'
import { COLLECTION_SORTS } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  Field,
  Input,
  SegmentedControl,
  Select,
  SortableList,
  Textarea,
  toast,
} from '@highsea-tv/ui-web'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CollectionArt } from './collection-art.tsx'
import { COLLECTION_LIST_TOPICS, DeleteDialog } from './collections.tsx'
import { collections as messages } from './collections-messages.ts'
import { completeRules, emptyRules, RuleBuilder, ruleErrors } from './collections-rules.tsx'
import {
  AudienceField,
  audienceError,
  useCurationT,
  useKept,
  useSettled,
} from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { AdminPage } from './shell.tsx'
import { useNow } from './time.ts'

type Sort = SmartCollectionInput['sort']
/** Sorts with no direction to choose. */
const UNDIRECTED: readonly Sort[] = ['manual', 'random']

/**
 * A draft handed over by another page (Movies › Save as smart collection), taken once by the
 * next new collection.
 */
export const handoff: { draft: Partial<SmartCollectionInput> | null } = { draft: null }

function blank(): SmartCollectionInput {
  const given = handoff.draft
  handoff.draft = null
  return {
    name: '',
    summary: '',
    artwork: null,
    rules: emptyRules(),
    include: [],
    exclude: [],
    sort: 'rating',
    descending: true,
    limit: null,
    audience: { kind: 'everyone' },
    ...given,
  }
}

const draftOf = ({
  id: _,
  updatedAt: _u,
  matched: _m,
  playable: _p,
  mosaic: _o,
  words: _w,
  usedBy: _b,
  ...c
}: CollectionSummary): SmartCollectionInput => c

export function CollectionEditor({ id }: { id: string }) {
  const t = useT(messages)
  const isNew = id === 'new'
  const existing = useQuery(`collections:get:${id}`, (c) =>
    isNew ? Promise.resolve(null) : c.collections.get({ params: { id } }),
  )
  return (
    <AdminPage title={isNew ? t('editor.new') : t('editor.edit')}>
      <Loadable query={existing} what={t('editor.what')}>
        {(c) => <Editor initial={c} />}
      </Loadable>
    </AdminPage>
  )
}

/** What the draft holds right now, asked for as it settles. */
function usePreview(id: string | undefined, draft: SmartCollectionInput) {
  const t = useT(messages)
  const settled = useSettled(draft)
  const { name, summary, audience, artwork, ...holds } = settled
  const collection: SmartCollectionInput = {
    ...settled,
    name: name.trim() || t('form'),
    rules: settled.rules && completeRules(settled.rules, t),
  }
  return useKept(
    useQuery(
      `collections:preview:${id ?? 'new'}:${JSON.stringify({ ...holds, rules: collection.rules })}`,
      (c) => c.collections.preview({ body: { ...(id ? { id } : {}), collection } }),
      ['movies.updated'],
    ),
  )
}

function Editor({ initial }: { initial: CollectionSummary | null }) {
  const t = useT(messages)
  const tc = useCurationT()
  const now = useNow()
  const router = useRouter()
  const [draft, setDraft] = useState<SmartCollectionInput>(() =>
    initial ? draftOf(initial) : blank(),
  )
  // the rules a picked collection had, kept while the owner looks at the other mode
  const [shelved, setShelved] = useState<RuleGroup | null>(null)
  const [tried, setTried] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const fields = useQuery(`collections:fields:${initial?.id ?? 'new'}`, (c) =>
    c.collections.fields({ query: initial ? { except: initial.id } : {} }),
  )
  const result = usePreview(initial?.id, draft)
  const save = useAction((c, body: SmartCollectionInput) =>
    initial
      ? c.collections.save({ params: { id: initial.id }, body })
      : c.collections.add({ body }),
  )
  const remove = useAction((c, id: string) => c.collections.remove({ params: { id } }))
  const set = (patch: Partial<SmartCollectionInput>) => setDraft((d) => ({ ...d, ...patch }))
  const smart = draft.rules !== null

  const errors = {
    name: !draft.name.trim() ? t('error.name') : undefined,
    films:
      !smart && !draft.include.length
        ? t('error.picked')
        : draft.rules && ruleErrors(draft.rules, t)
          ? t('error.rules')
          : undefined,
    audience: audienceError(draft.audience, tc),
  }
  const show = (e: string | undefined) => (tried ? e : undefined)

  const submit = () => {
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    save
      .run({ ...draft, name: draft.name.trim() })
      .then((c) => {
        toast.success(t('saved', { name: c.name }), { description: t('savedBody') })
        router.push('/collections')
      })
      .catch((e: Error) => toast.error(t('saveFailed'), { description: e.message }))
  }

  const sorts = COLLECTION_SORTS.filter((s) => (smart ? s !== 'manual' : true))
  const preview = result.status === 'success' ? result.data : null

  return (
    <div className="grid gap-6 expanded:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] expanded:items-start">
      <form
        aria-label={t('form')}
        className="grid min-w-0 gap-8"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid gap-4 medium:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-4">
            <Field label={t('name')} error={show(errors.name)}>
              <Input
                value={draft.name}
                maxLength={60}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={t('namePlaceholder')}
              />
            </Field>
            <Field label={t('summary')} hint={t('summaryHint')}>
              <Textarea
                value={draft.summary}
                maxLength={200}
                rows={2}
                onChange={(e) => set({ summary: e.target.value })}
                placeholder={t('summaryPlaceholder')}
              />
            </Field>
          </div>
          <Artwork draft={draft} set={set} items={preview?.items ?? []} />
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 font-medium text-text text-ui">{t('films')}</legend>
          <SegmentedControl
            aria-label={t('howFilms')}
            size="sm"
            value={smart ? 'rules' : 'picked'}
            onValueChange={(k) => {
              if (k === 'picked') {
                setShelved(draft.rules)
                set({
                  rules: null,
                  // start from what the rules picked, in their order
                  include: [
                    ...new Set([...(preview?.items.map((m) => m.id) ?? []), ...draft.include]),
                  ],
                  sort: 'manual',
                })
              } else
                set({
                  rules: shelved ?? emptyRules(),
                  include: [],
                  sort: 'rating',
                  descending: true,
                })
            }}
            options={[
              { value: 'rules', label: t('useRules') },
              { value: 'picked', label: t('pickThem') },
            ]}
            className="justify-self-start"
          />
          {show(errors.films) && (
            <p role="alert" className="text-badge-danger text-caption">
              {errors.films}
            </p>
          )}
          {draft.rules ? (
            <Loadable query={fields} what={t('rules')}>
              {(fs) => (
                <RuleBuilder
                  rules={draft.rules as RuleGroup}
                  onChange={(rules) => set({ rules })}
                  fields={fs}
                  now={now}
                  tried={tried}
                />
              )}
            </Loadable>
          ) : (
            <TitlePicker
              label={t('pickedFilms')}
              ids={draft.include}
              shown={preview}
              onChange={(include) => set({ include })}
              sortable
            />
          )}
        </fieldset>

        {smart && (
          <fieldset className="grid gap-4 medium:grid-cols-2">
            <legend className="mb-1.5 font-medium text-text text-ui">{t('exceptions')}</legend>
            <TitlePicker
              label={t('always')}
              hint={t('alwaysHint')}
              ids={draft.include}
              shown={preview}
              onChange={(include) =>
                set({ include, exclude: draft.exclude.filter((x) => !include.includes(x)) })
              }
            />
            <TitlePicker
              label={t('never')}
              hint={t('neverHint')}
              ids={draft.exclude}
              shown={preview}
              onChange={(exclude) =>
                set({ exclude, include: draft.include.filter((x) => !exclude.includes(x)) })
              }
            />
          </fieldset>
        )}

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 font-medium text-text text-ui">{t('order')}</legend>
          <div className="grid gap-3 medium:grid-cols-3">
            <Field label={t('sortBy')}>
              <Select
                value={draft.sort}
                onValueChange={(v) => set({ sort: v as Sort })}
                options={sorts.map((s) => ({ value: s, label: t(`sort.${s}`) }))}
              />
            </Field>
            {!UNDIRECTED.includes(draft.sort) && (
              <Field label={t('direction')}>
                <Select
                  value={draft.descending ? 'down' : 'up'}
                  onValueChange={(v) => set({ descending: v === 'down' })}
                  options={[
                    {
                      value: 'down',
                      label: t(`down.${draft.sort as Exclude<Sort, 'manual' | 'random'>}`),
                    },
                    {
                      value: 'up',
                      label: t(`up.${draft.sort as Exclude<Sort, 'manual' | 'random'>}`),
                    },
                  ]}
                />
              </Field>
            )}
            <Field label={t('howMany')} hint={draft.limit ? undefined : t('howManyHint')}>
              <Input
                type="number"
                min={1}
                max={500}
                value={draft.limit ?? ''}
                placeholder={t('all')}
                onChange={(e) =>
                  set({ limit: e.target.value ? Math.max(1, Number(e.target.value)) : null })
                }
                end={draft.limit ? <span className="text-caption">{t('first')}</span> : undefined}
              />
            </Field>
          </div>
          {draft.sort === 'random' && <p className="text-caption text-text-3">{t('randomHint')}</p>}
        </fieldset>

        <AudienceField
          value={draft.audience}
          onChange={(audience) => set({ audience })}
          error={show(errors.audience)}
        />

        <div className="flex flex-wrap gap-2 border-line border-t pt-4">
          <Button type="submit" variant="primary" loading={save.pending}>
            {initial ? t('saveChanges') : t('saveNew')}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href="/collections">{t('cancel')}</a>
          </Button>
          {initial && (
            <Button
              type="button"
              variant="ghost"
              icon="delete"
              className="ms-auto text-danger"
              onClick={() => setConfirm(true)}
            >
              {t('delete')}
            </Button>
          )}
        </div>
        {initial && (
          <DeleteDialog
            collection={{ name: draft.name || initial.name, usedBy: initial.usedBy }}
            open={confirm}
            onOpenChange={setConfirm}
            remove={() => remove.run(initial.id)}
            onDeleted={() => router.push('/collections')}
          />
        )}
      </form>
      <div className="min-w-0 expanded:sticky expanded:top-4">
        <Result result={result} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- artwork

function Artwork({
  draft,
  set,
  items,
}: {
  draft: SmartCollectionInput
  set: (patch: Partial<SmartCollectionInput>) => void
  items: CollectionPreview['items']
}) {
  const t = useT(messages)
  const posters = items.flatMap((m) => (m.poster ? [{ title: m.title, poster: m.poster }] : []))
  const mosaic = posters.slice(0, 4).map((p) => p.poster)
  return (
    <div className="grid content-start justify-items-start gap-2">
      <span className="font-medium text-text text-ui">{t('artwork')}</span>
      <CollectionArt poster={draft.artwork} mosaic={mosaic} className="w-28" />
      <Select
        aria-label={t('artworkChoice')}
        value={draft.artwork ?? 'mosaic'}
        onValueChange={(v) => set({ artwork: v === 'mosaic' ? null : v })}
        options={[
          { value: 'mosaic', label: t('artwork.mosaic') },
          // the one saved stays offered, even once its title has left the collection
          ...(draft.artwork && !posters.some((p) => p.poster === draft.artwork)
            ? [{ value: draft.artwork, label: t('artwork.posterHint') }]
            : []),
          ...posters
            .filter((p, i) => posters.findIndex((x) => x.poster === p.poster) === i)
            .slice(0, 24)
            .map((p) => ({ value: p.poster, label: t('artwork.poster', { title: p.title }) })),
        ]}
        className="w-40"
      />
      <p className="max-w-40 text-caption text-text-3">
        {draft.artwork ? t('artwork.posterHint') : t('artwork.mosaicHint')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- result

function Result({ result }: { result: ReturnType<typeof usePreview> }) {
  const t = useT(messages)
  return (
    <section
      aria-label={t('nowLabel')}
      aria-live="polite"
      className="grid gap-3 rounded-lg border border-line bg-s1 p-4"
    >
      <h2 className="font-semibold text-text text-ui">{t('now')}</h2>
      {result.status === 'error' ? (
        <p className="text-caption text-text-2">{result.error.message}</p>
      ) : result.status !== 'success' ? (
        <p className="text-caption text-text-3">{t('checking')}</p>
      ) : result.data.matched === 0 ? (
        <p className="text-caption text-text-2">{t('noMatch')}</p>
      ) : (
        <>
          <p className="text-text-2 text-ui">
            <span className="font-mono text-figure text-text">{result.data.matched}</span>{' '}
            {t('matched', { count: result.data.matched })};{' '}
            <span className="font-mono text-figure text-text">{result.data.playable}</span>{' '}
            {t('playable', { count: result.data.playable })}
          </p>
          {result.data.words && <p className="text-caption text-text-3">{result.data.words}.</p>}
          <ul
            aria-label={t('inIt')}
            className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-2"
          >
            {result.data.items.slice(0, 24).map((m) => (
              <li key={m.id} className="grid gap-1">
                <Thumb
                  src={m.poster}
                  alt={m.playable ? m.title : t('noFileAlt', { title: m.title })}
                  dim={!m.playable}
                />
                {!m.playable && (
                  <span className="truncate text-center text-[11px] text-text-3">
                    {t('noFile')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {result.data.items.length > 24 && (
            <p className="text-caption text-text-3">
              {t('more', { count: result.data.items.length - 24 })}
            </p>
          )}
        </>
      )}
    </section>
  )
}

/** A poster, or a plain tile with its name when the title has none. */
function Thumb({ src, alt, dim = false }: { src: string | null; alt: string; dim?: boolean }) {
  const className = `aspect-poster w-full rounded-[4px] ${dim ? 'opacity-40' : ''}`
  return src ? (
    // biome-ignore lint/performance/noImgElement: the server's image cache serves TMDB's sizes already (checkpoint 4, decision 4), as Poster does
    <img src={src} alt={alt} className={`${className} object-cover`} />
  ) : alt ? (
    <span role="img" aria-label={alt} className={`block bg-s3 ${className}`} />
  ) : (
    <span aria-hidden className={`block bg-s3 ${className}`} />
  )
}

// ---------------------------------------------------------------- picking films

type Title = {
  id: number
  title: string
  year: number | null
  poster: string | null
  file: boolean
}

const fromMovie = (m: Movie): Title => ({
  id: m.id,
  title: m.title,
  year: m.year,
  poster: m.art.poster,
  file: m.versions.some((v) => v.fileId),
})

/** A picked title the result doesn't show, named from the library. */
function useTitle(id: number, known: Title | undefined) {
  const movie = useQuery(`collections:title:${id}`, (c) =>
    known ? Promise.resolve(null) : c.movies.get({ params: { id } }),
  )
  return known ?? (movie.data ? fromMovie(movie.data) : undefined)
}

/** Films by hand: search the whole library (files or not), then keep or order them. */
function TitlePicker({
  label,
  hint,
  ids,
  shown,
  onChange,
  sortable = false,
}: {
  label: string
  hint?: string
  ids: number[]
  /** The live result, which names most picks without asking again. */
  shown: CollectionPreview | null
  onChange: (ids: number[]) => void
  sortable?: boolean
}) {
  const t = useT(messages)
  const [query, setQuery] = useState('')
  const q = useSettled(query.trim(), 200)
  const search = useQuery(
    `collections:search:${q}`,
    (c) => (q ? c.movies.list({ query: { title: q, limit: 30 } }) : Promise.resolve(null)),
    COLLECTION_LIST_TOPICS,
  )
  // titles seen in a search or the result, so a pick shows at once
  const [seen, setSeen] = useState<Record<number, Title>>({})
  const known = (id: number): Title | undefined => {
    const m = shown?.items.find((x) => x.id === id)
    return (
      seen[id] ??
      (m
        ? { id: m.id, title: m.title, year: m.year, poster: m.poster, file: m.playable }
        : undefined)
    )
  }
  const matches = (search.data?.items ?? []).filter((m) => !ids.includes(m.id)).slice(0, 6)
  const remove = (id: number) => onChange(ids.filter((x) => x !== id))
  return (
    <div className="grid content-start gap-2">
      <Field label={label} hint={hint}>
        <Input
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchLibrary')}
        />
      </Field>
      {q && search.status === 'success' && (
        <ul aria-label={t('matches', { label })} aria-live="polite" className="grid gap-1">
          {matches.length === 0 ? (
            <li className="px-1 text-caption text-text-3">{t('noTitle', { query: q })}</li>
          ) : (
            matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSeen((s) => ({ ...s, [m.id]: fromMovie(m) }))
                    onChange([...ids, m.id])
                    setQuery('')
                  }}
                  className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-start text-ui outline-none hover:bg-s2 focus-visible:ring-focus"
                >
                  <span className="truncate text-text">
                    {m.title} <span className="text-text-3">{m.year}</span>
                  </span>
                  <span className="text-accent-text text-caption">{t('add')}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {ids.length > 0 &&
        (sortable ? (
          <SortableList
            aria-label={label}
            items={ids}
            id={String}
            label={(id) => known(id)?.title ?? String(id)}
            onChange={onChange}
            className="gap-1.5"
            itemClassName="grid grid-cols-[auto_2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-line bg-s2 p-1.5"
          >
            {(id, handle) => (
              <>
                {handle}
                <PickedRow id={id} known={known(id)} label={label} onRemove={() => remove(id)} />
              </>
            )}
          </SortableList>
        ) : (
          <ul aria-label={label} className="grid gap-1.5">
            {ids.map((id) => (
              <li
                key={id}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-line bg-s2 p-1.5"
              >
                <PickedRow id={id} known={known(id)} label={label} onRemove={() => remove(id)} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}

function PickedRow({
  id,
  known,
  label,
  onRemove,
}: {
  id: number
  known: Title | undefined
  label: string
  onRemove: () => void
}) {
  const t = useT(messages)
  const m = useTitle(id, known)
  const title = m?.title ?? String(id)
  return (
    <>
      <div className="w-8">
        <Thumb src={m?.poster ?? null} alt="" />
      </div>
      <span className="flex min-w-0 items-center gap-2 text-text text-ui">
        <span className="truncate">
          {title} {m?.year && <span className="text-text-3">{m.year}</span>}
        </span>
        {m && !m.file && <Badge>{t('noFile')}</Badge>}
      </span>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="close"
        aria-label={t('removeFrom', { title, label: label.toLowerCase() })}
        onClick={onRemove}
      />
    </>
  )
}
