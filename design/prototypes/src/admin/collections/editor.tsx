// SPDX-License-Identifier: AGPL-3.0-only
// The collection editor (docs/product/collections.md#the-editor): name, summary and artwork; rules
// or films picked by hand; Always include and Never include; shows picked by hand, as rules match
// films only; sort, limit and who sees it. Beside it, what the draft holds right now: both counts,
// the rules in words and the posters, films then shows, as rules change.
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  SortableList,
  Textarea,
  toast,
} from '@highsea-tv/ui'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { CollectionArt } from '../../kit/collection-art.tsx'
import { sortLabels } from '../../mock/collections.ts'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type { CollectionSort, RuleGroup, SmartCollection } from '../../mock/types.ts'
import { AudienceField, audienceError } from '../curation/shared.tsx'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'
import { RuleBuilder, ruleErrors, ruleId } from './rules.tsx'

/**
 * A draft handed over by another page (Movies › Save as smart collection), taken once by the
 * next new collection.
 */
export const handoff: { draft: Partial<SmartCollection> | null } = { draft: null }

function blank(now: number): SmartCollection {
  const given = handoff.draft
  handoff.draft = null
  return {
    id: `sc-${now.toString(36)}`,
    name: '',
    summary: '',
    artwork: null,
    rules: { kind: 'group', id: ruleId('g'), match: 'all', rules: [] },
    include: [],
    exclude: [],
    shows: [],
    sort: 'rating',
    descending: true,
    limit: null,
    audience: { kind: 'everyone' },
    updatedAt: new Date(now).toISOString(),
    ...given,
  }
}

export function CollectionEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const existing = useQuery(`collections:get:${id}`, (c) =>
    isNew ? Promise.resolve(null) : c.collections.get(id),
  )
  return (
    <AdminPage title={isNew ? 'New collection' : 'Edit collection'}>
      <Loadable query={existing} what="the collection">
        {(c) => <Editor initial={c} />}
      </Loadable>
    </AdminPage>
  )
}

/** What the draft holds right now, asked for as it settles. */
function usePreview(draft: SmartCollection) {
  const [settled, setSettled] = useState(draft)
  useEffect(() => {
    const t = setTimeout(() => setSettled(draft), 150)
    return () => clearTimeout(t)
  }, [draft])
  const { name, summary, audience, ...holds } = settled
  const query = useQuery(
    `collections:preview:${JSON.stringify(holds)}`,
    (c) => c.collections.preview(settled),
    ['movies.updated', 'shows.updated'],
  )
  // keep the last result while the next loads, so the panel doesn't jump on every keystroke
  const last = useRef(query.data)
  if (query.status === 'success') last.current = query.data
  return query.status === 'loading' && last.current
    ? { ...query, status: 'success' as const, data: last.current, error: undefined }
    : query
}

function Editor({ initial }: { initial: SmartCollection | null }) {
  const now = useNow()
  const [, navigate] = useLocation()
  const [draft, setDraft] = useState<SmartCollection>(() => initial ?? blank(now))
  // the rules a picked collection had, kept while the owner looks at the other mode
  const [shelved, setShelved] = useState<RuleGroup | null>(null)
  const [tried, setTried] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const fields = useQuery(`collections:fields:${draft.id}`, (c) => c.collections.fields(draft.id))
  const result = usePreview(draft)
  const save = useAction((c, x: SmartCollection) => c.collections.save(x))
  const remove = useAction((c, id: string) => c.collections.remove(id))
  const set = (patch: Partial<SmartCollection>) => setDraft((d) => ({ ...d, ...patch }))
  const smart = draft.rules !== null

  const errors = {
    name: !draft.name.trim() ? 'Give the collection a name. The apps show it.' : undefined,
    films:
      !smart && !draft.include.length && !draft.shows.length
        ? 'Pick at least one film or show.'
        : smart && draft.rules && ruleErrors(draft.rules)
          ? 'Finish the conditions marked below.'
          : undefined,
    audience: audienceError(draft.audience),
  }
  const show = (e: string | undefined) => (tried ? e : undefined)

  const submit = () => {
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    save
      .run(draft)
      .then((c) => {
        toast.success(`“${c.name}” saved`, {
          description: 'Every app’s library shows it to its audience.',
        })
        navigate('/collections')
      })
      .catch((e: Error) => toast.error('Couldn’t save the collection', { description: e.message }))
  }

  const sorts = (Object.keys(sortLabels) as CollectionSort[]).filter((s) =>
    smart ? s !== 'manual' : true,
  )
  const direction = sortLabels[draft.sort]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 expanded:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] expanded:items-start">
      <form
        aria-label="Collection"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 medium:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-4">
            <Field label="Name" error={show(errors.name)}>
              <Input
                value={draft.name}
                maxLength={60}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="2010s, 4.5 stars and up, in English"
              />
            </Field>
            <Field label="Summary" hint="Optional. The apps show it under the name.">
              <Textarea
                value={draft.summary}
                maxLength={200}
                rows={2}
                onChange={(e) => set({ summary: e.target.value })}
                placeholder="The best of the decade, in English."
              />
            </Field>
          </div>
          <Artwork
            draft={draft}
            set={set}
            mosaic={[...(result.data?.items ?? []), ...(result.data?.shows ?? [])].map(
              (m) => m.poster,
            )}
          />
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 font-medium text-text text-ui">Films</legend>
          <SegmentedControl
            aria-label="How films get in"
            size="sm"
            value={smart ? 'rules' : 'picked'}
            onValueChange={(k) => {
              if (k === 'picked') {
                setShelved(draft.rules)
                set({
                  rules: null,
                  // start from what the rules picked, in their order
                  include: [
                    ...new Set([...(result.data?.items.map((m) => m.id) ?? []), ...draft.include]),
                  ],
                  sort: 'manual',
                })
              } else
                set({
                  rules: shelved ?? { kind: 'group', id: ruleId('g'), match: 'all', rules: [] },
                  include: [],
                  sort: 'rating',
                  descending: true,
                })
            }}
            options={[
              { value: 'rules', label: 'Use rules' },
              { value: 'picked', label: 'Pick them' },
            ]}
            className="justify-self-start"
          />
          {show(errors.films) && (
            <p role="alert" className="text-badge-danger text-caption">
              {errors.films}
            </p>
          )}
          {draft.rules ? (
            <Loadable query={fields} what="the fields">
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
              kind="films"
              label="Picked films"
              ids={draft.include}
              onChange={(include) => set({ include })}
              sortable
            />
          )}
        </fieldset>

        {smart && (
          <fieldset className="grid gap-4 medium:grid-cols-2">
            <legend className="mb-1.5 font-medium text-text text-ui">Exceptions</legend>
            <TitlePicker
              kind="films"
              label="Always include"
              hint="In it whatever the rules say."
              ids={draft.include}
              onChange={(include) =>
                set({ include, exclude: draft.exclude.filter((x) => !include.includes(x)) })
              }
            />
            <TitlePicker
              kind="films"
              label="Never include"
              hint="Left out whatever the rules say."
              ids={draft.exclude}
              onChange={(exclude) =>
                set({ exclude, include: draft.include.filter((x) => !exclude.includes(x)) })
              }
            />
          </fieldset>
        )}

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 font-medium text-text text-ui">Shows</legend>
          <TitlePicker
            kind="shows"
            label="Picked shows"
            hint="Rules match films, so shows join by hand. The apps list them after the films, in this order."
            ids={draft.shows}
            onChange={(shows) => set({ shows })}
            sortable
          />
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 font-medium text-text text-ui">Order</legend>
          <div className="grid gap-3 medium:grid-cols-3">
            <Field label="Sort by">
              <Select
                value={draft.sort}
                onValueChange={(v) => set({ sort: v as CollectionSort })}
                options={sorts.map((s) => ({ value: s, label: sortLabels[s].label }))}
              />
            </Field>
            {direction.up && (
              <Field label="Direction">
                <Select
                  value={draft.descending ? 'down' : 'up'}
                  onValueChange={(v) => set({ descending: v === 'down' })}
                  options={[
                    { value: 'down', label: direction.down },
                    { value: 'up', label: direction.up },
                  ]}
                />
              </Field>
            )}
            <Field label="How many" hint={draft.limit ? undefined : 'Every film it holds.'}>
              <Input
                type="number"
                min={1}
                value={draft.limit ?? ''}
                placeholder="All"
                onChange={(e) => set({ limit: e.target.value ? Number(e.target.value) : null })}
                end={draft.limit ? <span className="text-caption">first</span> : undefined}
              />
            </Field>
          </div>
          {draft.sort === 'random' && (
            <p className="text-caption text-text-3">
              A new order each day, the same all day, so a row doesn’t reshuffle on every visit.
            </p>
          )}
        </fieldset>

        <AudienceField
          value={draft.audience}
          onChange={(audience) => set({ audience })}
          error={show(errors.audience)}
        />

        <div className="flex flex-wrap gap-2 border-line border-t pt-4">
          <Button type="submit" variant="primary" loading={save.pending}>
            {initial ? 'Save changes' : 'Save collection'}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href={adminHref('/collections')}>Cancel</a>
          </Button>
          {initial && (
            <Button
              type="button"
              variant="danger-ghost"
              icon="delete"
              className="ms-auto"
              onClick={() => setConfirm(true)}
            >
              Delete
            </Button>
          )}
        </div>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete “${draft.name}”?`}
          description="It leaves every app’s library. What’s in it stays in the library."
          confirmLabel="Delete"
          destructive
          onConfirm={() =>
            remove
              .run(draft.id)
              .then(() => {
                toast({ title: `“${draft.name}” deleted` })
                navigate('/collections')
              })
              .catch((e: Error) =>
                toast.error('Couldn’t delete the collection', { description: e.message }),
              )
          }
        />
      </form>
      <div className="expanded:sticky expanded:top-4">
        <Result result={result} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- artwork

function Artwork({
  draft,
  set,
  mosaic,
}: {
  draft: SmartCollection
  set: (patch: Partial<SmartCollection>) => void
  mosaic: string[]
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] content-start justify-items-start gap-2">
      <span className="font-medium text-text text-ui">Artwork</span>
      <CollectionArt poster={draft.artwork} mosaic={mosaic.slice(0, 4)} className="w-28" />
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="Upload a poster"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) set({ artwork: URL.createObjectURL(file) })
        }}
      />
      {draft.artwork ? (
        <Button size="sm" variant="ghost" onClick={() => set({ artwork: null })}>
          Use the mosaic
        </Button>
      ) : (
        <Button size="sm" icon="upload" onClick={() => input.current?.click()}>
          Upload a poster
        </Button>
      )}
      <p className="max-w-28 text-caption text-text-3">
        {draft.artwork ? 'Your poster.' : 'The first four posters, until you upload one.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- result

type Held = { id: string; title: string; poster: string; playable: boolean }

/** Posters, dimmed with "No file" under those the apps don't show yet. */
function Posters({ label, items, none }: { label: string; items: Held[]; none: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-2">
      {items.map((m) => (
        <li key={m.id} className="grid gap-1">
          <img
            src={m.poster}
            alt={m.playable ? m.title : `${m.title}, ${none.toLowerCase()}`}
            className={`aspect-poster w-full rounded-[4px] object-cover ${m.playable ? '' : 'opacity-40'}`}
          />
          {!m.playable && (
            <span className="truncate text-center text-[11px] text-text-3">{none}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function Result({ result }: { result: ReturnType<typeof usePreview> }) {
  const shows = result.data?.shows ?? []
  const showsShown = shows.filter((x) => x.playable).length
  return (
    <section
      aria-label="What it holds now"
      aria-live="polite"
      className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line bg-s1 p-4"
    >
      <h2 className="font-semibold text-text text-ui">Right now</h2>
      {result.status !== 'success' ? (
        <p className="text-caption text-text-3">Checking what it holds…</p>
      ) : result.data.matched === 0 && shows.length === 0 ? (
        <p className="text-caption text-text-2">
          No films match yet. The apps don’t show it until one does.
        </p>
      ) : (
        <>
          {result.data.matched > 0 ? (
            <p className="text-text-2 text-ui">
              <span className="font-mono text-figure text-text">{result.data.matched}</span>{' '}
              {result.data.matched === 1 ? 'film matches' : 'films match'};{' '}
              <span className="font-mono text-figure text-text">{result.data.playable}</span>{' '}
              {result.data.playable === 1 ? 'has a file and shows' : 'have a file and show'} in the
              apps.
            </p>
          ) : (
            <p className="text-caption text-text-2">No films match yet.</p>
          )}
          {result.data.words && <p className="text-caption text-text-3">{result.data.words}.</p>}
          {result.data.items.length > 0 && (
            <Posters label="Films in it" items={result.data.items.slice(0, 24)} none="No file" />
          )}
          {result.data.items.length > 24 && (
            <p className="text-caption text-text-3">And {result.data.items.length - 24} more.</p>
          )}
          {shows.length > 0 && (
            <>
              <p className="text-text-2 text-ui">
                <span className="font-mono text-figure text-text">{shows.length}</span>{' '}
                {shows.length === 1 ? 'show' : 'shows'} picked;{' '}
                <span className="font-mono text-figure text-text">{showsShown}</span>{' '}
                {showsShown === 1 ? 'has episodes and shows' : 'have episodes and show'} in the
                apps, after the films.
              </p>
              <Posters label="Shows in it" items={shows} none="No episodes" />
            </>
          )}
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- picking films and shows

type Pickable = { id: string; title: string; year: number; poster: string; empty: boolean }

/** The library to pick from: every film (files or not), or every show (episodes or not). */
function usePickable(kind: 'films' | 'shows') {
  const films = useQuery(
    `collections:titles:${kind}`,
    (c) => (kind === 'films' ? c.movies.list() : Promise.resolve([])),
    ['movies.updated'],
  )
  const shows = useQuery(
    `collections:shows:${kind}`,
    (c) => (kind === 'shows' ? c.shows.list() : Promise.resolve([])),
    ['shows.updated'],
  )
  return kind === 'films'
    ? (films.data ?? [])
        .filter((m) => m.type === 'movie')
        .map(
          (m): Pickable => ({
            id: m.id,
            title: m.title,
            year: m.year,
            poster: m.art.poster,
            empty: !m.versions.some((v) => v.fileId),
          }),
        )
    : (shows.data ?? []).map(
        (s): Pickable => ({
          id: s.id,
          title: s.title,
          year: s.year,
          poster: s.art.poster,
          empty: s.episodes.have === 0,
        }),
      )
}

/** Films or shows by hand: search the whole library, then keep or order them. */
function TitlePicker({
  kind,
  label,
  hint,
  ids,
  onChange,
  sortable = false,
}: {
  kind: 'films' | 'shows'
  label: string
  hint?: string
  ids: string[]
  onChange: (ids: string[]) => void
  sortable?: boolean
}) {
  const all = usePickable(kind)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = q
    ? all.filter((m) => !ids.includes(m.id) && m.title.toLowerCase().includes(q)).slice(0, 6)
    : []
  const picked = ids.flatMap((id) => {
    const m = all.find((x) => x.id === id)
    return m ? [m] : []
  })
  const row = (m: Pickable) => (
    <>
      <img src={m.poster} alt="" className="aspect-poster w-8 rounded-[4px] object-cover" />
      <span className="flex min-w-0 items-center gap-2 text-text text-ui">
        <span className="truncate">
          {m.title} <span className="text-text-3">{m.year}</span>
        </span>
        {m.empty && <Badge>{kind === 'films' ? 'No file' : 'No episodes'}</Badge>}
      </span>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="close"
        aria-label={`Remove ${m.title} from ${label.toLowerCase()}`}
        onClick={() => onChange(ids.filter((x) => x !== m.id))}
      />
    </>
  )
  return (
    <div className="grid content-start gap-2">
      <Field label={label} hint={hint}>
        <Input
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'films' ? 'Search the library' : 'Search the shows'}
        />
      </Field>
      {q && (
        <ul aria-label={`${label}: matches`} aria-live="polite" className="grid gap-1">
          {matches.length === 0 ? (
            <li className="px-1 text-caption text-text-3">
              No {kind === 'films' ? 'film' : 'show'} matches “{query}”.
            </li>
          ) : (
            matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...ids, m.id])
                    setQuery('')
                  }}
                  className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-start text-ui outline-none hover:bg-s2 focus-visible:ring-focus"
                >
                  <span className="truncate text-text">
                    {m.title} <span className="text-text-3">{m.year}</span>
                  </span>
                  <span className="text-accent-text text-caption">Add</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {picked.length > 0 &&
        (sortable ? (
          <SortableList
            aria-label={label}
            items={picked}
            id={(m) => m.id}
            label={(m) => m.title}
            onChange={(next) => onChange(next.map((m) => m.id))}
            className="gap-1.5"
            itemClassName="grid grid-cols-[auto_2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-line bg-s2 p-1.5"
          >
            {(m, handle) => (
              <>
                {handle}
                {row(m)}
              </>
            )}
          </SortableList>
        ) : (
          <ul aria-label={label} className="grid gap-1.5">
            {picked.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-line bg-s2 p-1.5"
              >
                {row(m)}
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
