'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The featured-section composer (A11, curation.md#section-composer; checkpoint 8c), ported from
// the prototype's curation/section-editor.tsx: a title, a layout, where its titles come from
// (picked by hand, or a rule that keeps itself fresh), hero taglines, who sees it and when, beside
// the live client preview. What a source picks comes from `POST /curation/sections/resolve`; the
// picker searches the library (`GET /movies?title=`) and offers titles with a file.
import type {
  FeaturedLayout,
  FeaturedRule,
  FeaturedSection,
  FeaturedSectionInput,
  FeaturedSource,
  HomeItem,
  RuleOptions,
} from '@highsea-tv/api-contract'
import { FEATURED_RULES } from '@highsea-tv/api-contract'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  SortableList,
  toast,
} from '@highsea-tv/ui-web'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useRuleOptions } from './curation.tsx'
import { ClientPreview } from './curation-preview.tsx'
import {
  AudienceField,
  audienceError,
  ScheduleField,
  useCurationT,
  useKept,
  useSettled,
} from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { AdminPage } from './shell.tsx'
import { useNow } from './time.ts'

const LAYOUTS: FeaturedLayout[] = ['hero', 'row', 'spotlight']
const WINDOWS = ['7d', '30d', '90d'] as const

/** A rule's first value: the library's first genre or collection (yours first), when it has one. */
function ruleDefault(rule: FeaturedRule, options: RuleOptions | undefined): string {
  if (rule === 'recently-added') return '30d'
  if (rule === 'genre') return options?.genres[0] ?? ''
  return options?.smart[0]?.id ?? String(options?.collections[0]?.id ?? '')
}

function blank(now: number): FeaturedSectionInput {
  return {
    title: '',
    tagline: null,
    layout: 'row',
    source: { kind: 'manual', itemIds: [] },
    overrides: [],
    audience: { kind: 'everyone' },
    schedule: { start: new Date(now).toISOString(), end: null },
  }
}

const draftOf = ({ id: _, order: _o, ...f }: FeaturedSection): FeaturedSectionInput => f

export function SectionEditor({ id }: { id: string }) {
  const t = useCurationT()
  const isNew = id === 'new'
  const existing = useQuery(`curation:section:${id}`, (c) =>
    isNew ? Promise.resolve(null) : c.curation.section({ params: { id } }),
  )
  return (
    <AdminPage title={isNew ? t('section.new') : t('section.edit')}>
      <Loadable query={existing} what={t('section.what')}>
        {(f) => <Composer initial={f} />}
      </Loadable>
    </AdminPage>
  )
}

/** What the source picks right now, fetched as the draft settles. */
function useResolved(source: FeaturedSource) {
  const settled = useSettled(source)
  // a rule without a value yet (an empty library) picks nothing, without asking
  const empty = settled.kind === 'rule' ? !settled.value.trim() : !settled.itemIds.length
  return useKept(
    useQuery(`curation:resolve:${JSON.stringify(settled)}`, (c) =>
      empty
        ? Promise.resolve({ items: [] as HomeItem[], total: 0 })
        : c.curation.resolve({ body: { source: settled } }),
    ),
  )
}

function Composer({ initial }: { initial: FeaturedSection | null }) {
  const t = useCurationT()
  const now = useNow()
  const router = useRouter()
  const [draft, setDraft] = useState<FeaturedSectionInput>(() =>
    initial ? draftOf(initial) : blank(now),
  )
  const [tried, setTried] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const resolved = useResolved(draft.source)
  const save = useAction((c, body: FeaturedSectionInput) =>
    initial
      ? c.curation.saveSection({ params: { id: initial.id }, body })
      : c.curation.addSection({ body }),
  )
  const remove = useAction((c, id: string) => c.curation.removeSection({ params: { id } }))
  const set = (patch: Partial<FeaturedSectionInput>) => setDraft((d) => ({ ...d, ...patch }))

  const errors = {
    title: !draft.title.trim() ? t('error.sectionTitle') : undefined,
    source:
      draft.source.kind === 'manual' && !draft.source.itemIds.length
        ? t('error.source')
        : undefined,
    audience: audienceError(draft.audience, t),
    schedule:
      draft.schedule.end && Date.parse(draft.schedule.end) <= Date.parse(draft.schedule.start)
        ? t('error.endBeforeStart')
        : undefined,
  }
  const show = (e: string | undefined) => (tried ? e : undefined)

  // shown as if it were live now, in its place in the order; the home screen alone, since
  // announcements would sit over the sections being previewed
  const preview = useMemo(
    () => ({ kind: 'section' as const, id: initial?.id, section: draft }),
    [draft, initial?.id],
  )

  const submit = () => {
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    save
      .run(draft)
      .then((f) => {
        toast.success(t('saved.section', { title: f.title }), {
          description: t('saved.sectionBody'),
        })
        router.push('/curation/featured')
      })
      .catch((e: Error) => toast.error(t('saveFailed.section'), { description: e.message }))
  }

  return (
    <div className="grid gap-6 expanded:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] expanded:items-start">
      <form
        aria-label={t('section.form')}
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid gap-4">
          <Field label={t('field.title')} error={show(errors.title)}>
            <Input
              value={draft.title}
              maxLength={60}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={t('field.sectionPlaceholder')}
            />
          </Field>
          <Field label={t('field.after')} hint={t('field.afterHint')}>
            <Input
              value={draft.tagline ?? ''}
              maxLength={60}
              onChange={(e) => set({ tagline: e.target.value || null })}
              placeholder={t('field.afterPlaceholder')}
            />
          </Field>
          <div className="grid gap-2">
            <span className="font-medium text-text text-ui">{t('layout')}</span>
            <SegmentedControl
              aria-label={t('layout')}
              size="sm"
              value={draft.layout}
              onValueChange={(v) => set({ layout: v as FeaturedLayout })}
              options={LAYOUTS.map((l) => ({ value: l, label: t(`layout.${l}`) }))}
              className="justify-self-start"
            />
            <p className="text-caption text-text-3">{t(`layoutHint.${draft.layout}`)}</p>
          </div>
        </div>

        <Source draft={draft} set={set} error={show(errors.source)} resolved={resolved} />

        {draft.layout === 'hero' &&
          resolved.status === 'success' &&
          resolved.data.items.length > 0 && (
            <Taglines draft={draft} set={set} items={resolved.data.items} />
          )}

        <AudienceField
          value={draft.audience}
          onChange={(audience) => set({ audience })}
          error={show(errors.audience)}
        />
        <ScheduleField
          value={draft.schedule}
          onChange={(schedule) => set({ schedule })}
          now={now}
        />

        <div className="flex flex-wrap gap-2 border-line border-t pt-4">
          <Button type="submit" variant="primary" loading={save.pending}>
            {initial ? t('saveChanges') : t('addToHome')}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href="/curation/featured">{t('cancel')}</a>
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
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={t('deleteTitle', { title: initial.title })}
            description={t('deleteSectionBody')}
            confirmLabel={t('delete')}
            destructive
            onConfirm={() =>
              remove
                .run(initial.id)
                .then(() => {
                  toast({ title: t('deleted', { title: initial.title }) })
                  router.push('/curation/featured')
                })
                .catch((e: Error) => toast.error(t('failed'), { description: e.message }))
            }
          />
        )}
      </form>
      <div className="min-w-0 expanded:sticky expanded:top-4">
        <ClientPreview
          draft={preview}
          what={t('thisSection')}
          note={t('noAnnouncements')}
          reveal={initial?.id ?? 'draft'}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- source

function Source({
  draft,
  set,
  error,
  resolved,
}: {
  draft: FeaturedSectionInput
  set: (patch: Partial<FeaturedSectionInput>) => void
  error?: string
  resolved: ReturnType<typeof useResolved>
}) {
  const t = useCurationT()
  const options = useRuleOptions()
  const s = draft.source
  const picks = resolved.status === 'success' ? resolved.data : null
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1.5 font-medium text-text text-ui">{t('titles')}</legend>
      <SegmentedControl
        aria-label={t('whereFrom')}
        size="sm"
        value={s.kind}
        onValueChange={(k) =>
          set({
            source:
              k === 'manual'
                ? // a rule's picks become the hand-picked list, to start from
                  { kind: 'manual', itemIds: picks?.items.map((m) => m.id) ?? [] }
                : { kind: 'rule', rule: 'recently-added', value: '30d' },
          })
        }
        options={[
          { value: 'manual', label: t('pickThem') },
          { value: 'rule', label: t('useRule') },
        ]}
        className="justify-self-start"
      />
      {s.kind === 'manual' ? (
        <Picker
          ids={s.itemIds}
          picked={picks?.items ?? []}
          onChange={(itemIds) => set({ source: { kind: 'manual', itemIds } })}
        />
      ) : (
        <div className="grid gap-3 medium:grid-cols-2">
          <Field label={t('rule')}>
            <Select
              value={s.rule}
              onValueChange={(r) =>
                set({
                  source: {
                    kind: 'rule',
                    rule: r as FeaturedRule,
                    value: ruleDefault(r as FeaturedRule, options.data),
                  },
                })
              }
              options={FEATURED_RULES.map((r) => ({ value: r, label: t(`rule.${r}`) }))}
            />
          </Field>
          {s.rule === 'recently-added' && (
            <Field label={t('addedIn')}>
              <Select
                value={s.value}
                onValueChange={(value) => set({ source: { ...s, value } })}
                options={WINDOWS.map((w) => ({
                  value: w,
                  label: t('days', { count: w.replace('d', '') }),
                }))}
              />
            </Field>
          )}
          {s.rule === 'genre' && (
            <Field
              label={t('genre')}
              hint={options.data?.genres.length ? undefined : t('noGenres')}
            >
              <Select
                value={s.value}
                onValueChange={(value) => set({ source: { ...s, value } })}
                options={(options.data?.genres ?? (s.value ? [s.value] : [])).map((g) => ({
                  value: g,
                  label: g,
                }))}
              />
            </Field>
          )}
          {s.rule === 'collection' && (
            <Field
              label={t('collection')}
              hint={
                options.data?.collections.length || options.data?.smart.length
                  ? t('collectionHint')
                  : t('noCollections')
              }
            >
              <Select
                value={s.value}
                onValueChange={(value) => set({ source: { ...s, value } })}
                options={[
                  // yours first, then TMDB's (checkpoint 8d)
                  ...(options.data?.smart ?? []).map((c) => ({
                    value: c.id,
                    label: t('collectionYours', { name: c.name }),
                  })),
                  ...(options.data?.collections ?? []).map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  })),
                ]}
              />
            </Field>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-badge-danger text-caption">
          {error}
        </p>
      )}
      {s.kind === 'rule' && (
        <div aria-live="polite" className="grid gap-2 rounded-md border border-line bg-s2 p-3">
          <p className="text-caption text-text-2">
            {resolved.status === 'error'
              ? resolved.error.message
              : picks
                ? picks.total === 0
                  ? t('picks.none')
                  : t('picks.some', { count: picks.total })
                : t('picks.checking')}
          </p>
          {picks && picks.items.length > 0 && (
            <ul className="flex gap-1.5 overflow-hidden">
              {picks.items.slice(0, 8).map((m) => (
                <li key={m.id} className="w-10 shrink-0">
                  <PosterThumb title={m.title} src={m.art.poster} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  )
}

function PosterThumb({
  title,
  src,
  alt = title,
}: {
  title: string
  src: string | null
  alt?: string
}) {
  if (src)
    // biome-ignore lint/performance/noImgElement: the server's image cache serves TMDB's sizes already (checkpoint 4, decision 4), as Poster does
    return <img src={src} alt={alt} className="aspect-poster w-full rounded-[4px] object-cover" />
  return alt ? (
    <span role="img" aria-label={alt} className="block aspect-poster w-full rounded-[4px] bg-s3" />
  ) : (
    <span aria-hidden className="block aspect-poster w-full rounded-[4px] bg-s3" />
  )
}

/** Titles picked by hand: search the library for titles with a file, then order them. */
function Picker({
  ids,
  picked: resolved,
  onChange,
}: {
  ids: number[]
  /** What the picked ids resolve to, in order. */
  picked: HomeItem[]
  onChange: (ids: number[]) => void
}) {
  const t = useCurationT()
  const [query, setQuery] = useState('')
  const q = useSettled(query.trim(), 200)
  const search = useQuery(`curation:search:${q}`, (c) =>
    q ? c.movies.list({ query: { title: q, limit: 30 } }) : Promise.resolve(null),
  )
  // what's been added since the last resolve, so it shows at once
  const [added, setAdded] = useState<HomeItem[]>([])
  const known = new Map([...added, ...resolved].map((m) => [m.id, m]))
  const picked = ids.flatMap((id) => {
    const m = known.get(id)
    return m ? [m] : []
  })
  const matches = (search.data?.items ?? [])
    .filter((m) => !ids.includes(m.id) && m.versions.some((v) => v.fileId))
    .slice(0, 6)
  return (
    <div className="grid gap-3">
      {picked.length > 0 && (
        <SortableList
          aria-label={t('picked')}
          items={picked}
          id={(m) => String(m.id)}
          label={(m) => m.title}
          onChange={(next) => onChange(next.map((m) => m.id))}
          className="gap-1.5"
          itemClassName="grid grid-cols-[auto_2rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border border-line bg-s2 p-1.5"
        >
          {(m, handle) => (
            <>
              {handle}
              <div className="w-8">
                <PosterThumb title={m.title} src={m.art.poster} alt="" />
              </div>
              <span className="truncate text-text text-ui">
                {m.title} <span className="text-text-3">{m.year}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="close"
                aria-label={t('remove', { title: m.title })}
                onClick={() => onChange(ids.filter((x) => x !== m.id))}
              />
            </>
          )}
        </SortableList>
      )}
      <Field label={t('addTitles')} hint={t('addTitlesHint')}>
        <Input
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchLibrary')}
        />
      </Field>
      {q && search.status === 'success' && (
        <ul aria-label={t('matching')} aria-live="polite" className="grid gap-1">
          {matches.length === 0 ? (
            <li className="px-1 text-caption text-text-3">{t('noMatch', { query: q })}</li>
          ) : (
            matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAdded((a) => [
                      ...a,
                      {
                        id: m.id,
                        type: 'movie',
                        title: m.title,
                        year: m.year,
                        runtimeMinutes: m.runtimeMinutes,
                        genres: m.genres,
                        synopsis: m.synopsis,
                        rating: m.rating,
                        voteCount: m.voteCount,
                        releaseDate: m.releaseDate,
                        addedAt: m.addedAt,
                        status: m.status,
                        playable: false,
                        art: m.art,
                        progress: null,
                        position: 0,
                        tagline: null,
                      },
                    ])
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
    </div>
  )
}

/** Hero only: a tagline per title, in place of its synopsis. */
function Taglines({
  draft,
  set,
  items,
}: {
  draft: FeaturedSectionInput
  set: (patch: Partial<FeaturedSectionInput>) => void
  items: HomeItem[]
}) {
  const t = useCurationT()
  const value = (id: number) => draft.overrides.find((o) => o.itemId === id)?.tagline ?? ''
  const change = (id: number, tagline: string) => {
    const kept = draft.overrides.find((o) => o.itemId === id)
    set({
      overrides: [
        ...draft.overrides.filter((o) => o.itemId !== id),
        ...(tagline || kept?.artwork
          ? [{ itemId: id, artwork: kept?.artwork ?? null, tagline: tagline || null }]
          : []),
      ],
    })
  }
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1.5 font-medium text-text text-ui">{t('taglines')}</legend>
      <p className="text-caption text-text-3">{t('taglinesHint')}</p>
      {items.slice(0, 6).map((m) => (
        <Field key={m.id} label={m.title}>
          <Input
            value={value(m.id)}
            maxLength={120}
            placeholder={m.synopsis}
            onChange={(e) => change(m.id, e.target.value)}
          />
        </Field>
      ))}
    </fieldset>
  )
}
