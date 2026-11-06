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
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Field,
  Image,
  Input,
  SearchField,
  SegmentedControl,
  Select,
  SortableList,
  Text,
  Textarea,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ReactElement, type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { CollectionArt } from './collection-art.tsx'
import { COLLECTION_LIST_TOPICS, DeleteDialog } from './collections.tsx'
import { collections as messages } from './collections-messages.ts'
import {
  completeRules,
  emptyRules,
  FormError,
  MatchItem,
  MatchList,
  NoMatch,
  RuleBuilder,
  ruleErrors,
} from './collections-rules.tsx'
import {
  AudienceField,
  audienceError,
  useCurationT,
  useKept,
  useSettled,
} from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { useRouter } from './navigation.tsx'
import { AdminPage } from './shell.tsx'
import { useNow } from './time.ts'

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure
/** The web's 6 and 10 (gap-1.5, gap-2.5), between the space scale's steps. */
const SIX = s['1'] + s['0.5']
const TEN = s['2'] + s['0.5']

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

const NOTHING: CollectionPreview = { matched: 0, playable: 0, items: [], words: null }

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
  // picked by hand with none picked yet, it holds nothing; the server would refuse it as a save
  // ("Add a rule, or pick at least one film."), so it isn't asked
  const empty = !collection.rules && !collection.include.length
  return useKept(
    useQuery(
      `collections:preview:${id ?? 'new'}:${JSON.stringify({ ...holds, rules: collection.rules })}`,
      (c) =>
        empty
          ? Promise.resolve(NOTHING)
          : c.collections.preview({ body: { ...(id ? { id } : {}), collection } }),
      ['movies.updated'],
    ),
  )
}

/** A fieldset's legend: the web's `font-medium text-ui`, 6 above what it names. */
export function Legend({ children }: { children: string }) {
  return (
    <Text size={ui.size} leading={ui.leading} weight={500} style={{ marginBottom: SIX }}>
      {children}
    </Text>
  )
}

/** A group of fields named by its legend (a `fieldset`, read as a group). */
function FieldGroup({
  legend,
  gap = s['3'],
  children,
}: {
  legend: string
  gap?: number
  children: ReactNode
}) {
  return (
    <View role="group" aria-label={legend} style={{ gap }}>
      <Legend>{legend}</Legend>
      {children}
    </View>
  )
}

/** Fields side by side from medium, each an equal share; stacked in a compact window. */
function Columns({ children, gap = s['3'] }: { children: ReactElement[]; gap?: number }) {
  const side = useWindowAtLeast(breakpoints.medium)
  return (
    <View style={{ flexDirection: side ? 'row' : 'column', gap, alignItems: 'flex-start' }}>
      {children.map((c) => (
        <View
          key={c.key}
          style={side ? { flex: 1, flexBasis: 0, minWidth: 0 } : { alignSelf: 'stretch' }}
        >
          {c}
        </View>
      ))}
    </View>
  )
}

/** The result's column beside the form (the web's minmax(18rem, 22rem)). */
const RESULT = { minWidth: 288, maxWidth: 352 }

function Editor({ initial }: { initial: CollectionSummary | null }) {
  const t = useT(messages)
  const tc = useCurationT()
  const theme = useTheme()
  const now = useNow()
  const router = useRouter()
  const beside = useWindowAtLeast(breakpoints.expanded)
  const medium = useWindowAtLeast(breakpoints.medium)
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

  const sorts = COLLECTION_SORTS.filter((x) => (smart ? x !== 'manual' : true))
  const preview = result.status === 'success' ? result.data : null
  const directed = draft.sort as Exclude<Sort, 'manual' | 'random'>

  return (
    <View
      style={{
        flexDirection: beside ? 'row' : 'column',
        alignItems: beside ? 'flex-start' : 'stretch',
        gap: s['6'],
      }}
    >
      <View
        role="form"
        aria-label={t('form')}
        style={{ flex: beside ? 1 : undefined, minWidth: 0, gap: s['8'] }}
      >
        <View
          style={{
            flexDirection: medium ? 'row' : 'column',
            alignItems: 'flex-start',
            gap: s['4'],
          }}
        >
          <View
            style={{ gap: s['4'], flex: medium ? 1 : undefined, alignSelf: 'stretch', minWidth: 0 }}
          >
            <Field label={t('name')} error={show(errors.name)}>
              <Input
                value={draft.name}
                maxLength={60}
                onChangeText={(name) => set({ name })}
                onSubmitEditing={submit}
                placeholder={t('namePlaceholder')}
              />
            </Field>
            <Field label={t('summary')} hint={t('summaryHint')}>
              <Textarea
                value={draft.summary}
                maxLength={200}
                numberOfLines={2}
                onChangeText={(summary) => set({ summary })}
                placeholder={t('summaryPlaceholder')}
              />
            </Field>
          </View>
          <Artwork draft={draft} set={set} items={preview?.items ?? []} />
        </View>

        <FieldGroup legend={t('films')}>
          <View style={{ alignSelf: 'flex-start' }}>
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
            />
          </View>
          {show(errors.films) ? <FormError>{errors.films as string}</FormError> : null}
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
        </FieldGroup>

        {smart && (
          <FieldGroup legend={t('exceptions')} gap={s['4']}>
            <Columns gap={s['4']}>
              {[
                <TitlePicker
                  key="always"
                  label={t('always')}
                  hint={t('alwaysHint')}
                  ids={draft.include}
                  shown={preview}
                  onChange={(include) =>
                    set({ include, exclude: draft.exclude.filter((x) => !include.includes(x)) })
                  }
                />,
                <TitlePicker
                  key="never"
                  label={t('never')}
                  hint={t('neverHint')}
                  ids={draft.exclude}
                  shown={preview}
                  onChange={(exclude) =>
                    set({ exclude, include: draft.include.filter((x) => !exclude.includes(x)) })
                  }
                />,
              ]}
            </Columns>
          </FieldGroup>
        )}

        <FieldGroup legend={t('order')}>
          <Columns>
            {[
              <Field key="sort" label={t('sortBy')}>
                <Select
                  value={draft.sort}
                  onValueChange={(v) => set({ sort: v as Sort })}
                  options={sorts.map((x) => ({ value: x, label: t(`sort.${x}`) }))}
                />
              </Field>,
              UNDIRECTED.includes(draft.sort) ? null : (
                <Field key="direction" label={t('direction')}>
                  <Select
                    value={draft.descending ? 'down' : 'up'}
                    onValueChange={(v) => set({ descending: v === 'down' })}
                    options={[
                      { value: 'down', label: t(`down.${directed}`) },
                      { value: 'up', label: t(`up.${directed}`) },
                    ]}
                  />
                </Field>
              ),
              <Field
                key="limit"
                label={t('howMany')}
                hint={draft.limit ? undefined : t('howManyHint')}
              >
                <Input
                  end={draft.limit ? t('first') : undefined}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  value={draft.limit ? String(draft.limit) : ''}
                  placeholder={t('all')}
                  onChangeText={(v) => {
                    const n = Number.parseInt(v, 10)
                    set({ limit: v && !Number.isNaN(n) ? Math.min(500, Math.max(1, n)) : null })
                  }}
                />
              </Field>,
            ].filter((x) => x !== null)}
          </Columns>
          {draft.sort === 'random' ? (
            <Text variant="caption" color="text-3">
              {t('randomHint')}
            </Text>
          ) : null}
        </FieldGroup>

        <AudienceField
          value={draft.audience}
          onChange={(audience) => set({ audience })}
          error={show(errors.audience)}
        />

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: s['2'],
            borderTopWidth: 1,
            borderTopColor: theme.colors.line,
            paddingTop: s['4'],
          }}
        >
          <Button variant="primary" loading={save.pending} onPress={submit}>
            {initial ? t('saveChanges') : t('saveNew')}
          </Button>
          <Button variant="ghost" href="/collections">
            {t('cancel')}
          </Button>
          {initial && (
            <View style={{ marginStart: 'auto' }}>
              <Button variant="danger-ghost" icon="delete" onPress={() => setConfirm(true)}>
                {t('delete')}
              </Button>
            </View>
          )}
        </View>
        {initial && (
          <DeleteDialog
            collection={{ name: draft.name || initial.name, usedBy: initial.usedBy }}
            open={confirm}
            onClose={() => setConfirm(false)}
            remove={() => remove.run(initial.id)}
            onDeleted={() => router.push('/collections')}
          />
        )}
      </View>
      <View
        style={[
          { minWidth: 0 },
          beside ? { ...RESULT, flex: 1 } : null,
          // it stays in view while the form scrolls (the web's sticky top-4)
          beside ? ({ position: 'sticky', top: s['4'] } as object) : null,
        ]}
      >
        <Result result={result} />
      </View>
    </View>
  )
}

// ---------------------------------------------------------------- artwork

/** The artwork's column (the web's w-40) and its poster (w-28). */
const ARTWORK = { column: 160, poster: 112 }

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
    <View style={{ gap: s['2'], alignItems: 'flex-start', width: ARTWORK.column }}>
      <Text size={ui.size} leading={ui.leading} weight={500}>
        {t('artwork')}
      </Text>
      <CollectionArt poster={draft.artwork} mosaic={mosaic} width={ARTWORK.poster} />
      <View style={{ alignSelf: 'stretch' }}>
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
        />
      </View>
      <Text variant="caption" color="text-3">
        {draft.artwork ? t('artwork.posterHint') : t('artwork.mosaicHint')}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------- result

/** The result's posters: as many 64-wide columns as fit (the web's auto-fill minmax(4rem, 1fr)). */
const THUMB = 64

function Result({ result }: { result: ReturnType<typeof usePreview> }) {
  const t = useT(messages)
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const gap = s['2']
  const columns = Math.max(1, Math.floor((width + gap) / (THUMB + gap)))
  const cell = width ? (width - gap * (columns - 1)) / columns : THUMB
  return (
    <View
      role="region"
      aria-label={t('nowLabel')}
      aria-live="polite"
      style={{
        gap: s['3'],
        padding: s['4'],
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
        minWidth: 0,
      }}
    >
      <Text size={ui.size} leading={ui.leading} weight={600} role="heading" aria-level={2}>
        {t('now')}
      </Text>
      {result.status === 'error' ? (
        <Text variant="caption" color="text-2">
          {result.error.message}
        </Text>
      ) : result.status !== 'success' ? (
        <Text variant="caption" color="text-3">
          {t('checking')}
        </Text>
      ) : result.data.matched === 0 ? (
        <Text variant="caption" color="text-2">
          {t('noMatch')}
        </Text>
      ) : (
        <>
          <Text size={ui.size} leading={ui.leading} color="text-2">
            <Text size={figure.size} mono color="text">
              {String(result.data.matched)}
            </Text>
            {` ${t('matched', { count: result.data.matched })}; `}
            <Text size={figure.size} mono color="text">
              {String(result.data.playable)}
            </Text>
            {` ${t('playable', { count: result.data.playable })}`}
          </Text>
          {result.data.words ? (
            <Text variant="caption" color="text-3">
              {`${result.data.words}.`}
            </Text>
          ) : null}
          <View
            role="list"
            aria-label={t('inIt')}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}
          >
            {result.data.items.slice(0, 24).map((m) => (
              <View key={m.id} role="listitem" style={{ width: cell, gap: s['1'] }}>
                <Thumb
                  src={m.poster}
                  alt={m.playable ? m.title : t('noFileAlt', { title: m.title })}
                  dim={!m.playable}
                />
                {!m.playable && (
                  <Text size={11} color="text-3" align="center" numberOfLines={1}>
                    {t('noFile')}
                  </Text>
                )}
              </View>
            ))}
          </View>
          {result.data.items.length > 24 && (
            <Text variant="caption" color="text-3">
              {t('more', { count: result.data.items.length - 24 })}
            </Text>
          )}
        </>
      )}
    </View>
  )
}

/** A poster, or a plain tile with its name when the title has none. */
function Thumb({ src, alt, dim = false }: { src: string | null; alt: string; dim?: boolean }) {
  const theme = useTheme()
  const [w, h] = tokens.aspect.poster
  const style = {
    width: '100%',
    aspectRatio: w / h,
    borderRadius: 4,
    opacity: dim ? 0.4 : 1,
  } as const
  return src ? (
    <Image
      source={{ uri: src }}
      alt={alt}
      aria-hidden={!alt || undefined}
      contentFit="cover"
      style={style}
    />
  ) : (
    <View
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={!alt || undefined}
      style={[style, { backgroundColor: theme.colors.s3 }]}
    />
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
  const theme = useTheme()
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
  const card = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TEN,
    padding: SIX,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: tokens.radius.md,
    backgroundColor: theme.colors.s2,
  } as const
  return (
    <View style={{ gap: s['2'] }}>
      <Field label={label} hint={hint}>
        <SearchField
          label={label}
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchLibrary')}
        />
      </Field>
      {q !== '' && search.status === 'success' && (
        <MatchList label={t('matches', { label })}>
          {matches.length === 0 ? (
            <NoMatch>{t('noTitle', { query: q })}</NoMatch>
          ) : (
            matches.map((m) => (
              <MatchItem
                key={m.id}
                name={m.title}
                detail={m.year ? String(m.year) : undefined}
                onPress={() => {
                  setSeen((x) => ({ ...x, [m.id]: fromMovie(m) }))
                  onChange([...ids, m.id])
                  setQuery('')
                }}
              />
            ))
          )}
        </MatchList>
      )}
      {ids.length > 0 &&
        (sortable ? (
          <SortableList
            accessibilityLabel={label}
            items={ids}
            id={String}
            label={(id) => known(id)?.title ?? String(id)}
            onChange={onChange}
            messages={{
              move: (title) => t('order.move', { title }),
              moveUp: (title) => t('order.moveUp', { title }),
              moveDown: (title) => t('order.moveDown', { title }),
              moved: (title, index, count) => t('order.moved', { title, index, count }),
            }}
          >
            {(id, handle) => (
              <View style={card}>
                {handle}
                <PickedRow id={id} known={known(id)} label={label} onRemove={() => remove(id)} />
              </View>
            )}
          </SortableList>
        ) : (
          <View role="list" aria-label={label} style={{ gap: SIX }}>
            {ids.map((id) => (
              <View key={id} role="listitem" style={card}>
                <PickedRow id={id} known={known(id)} label={label} onRemove={() => remove(id)} />
              </View>
            ))}
          </View>
        ))}
    </View>
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
      <View style={{ width: s['8'] }}>
        <Thumb src={m?.poster ?? null} alt="" />
      </View>
      <View
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: s['2'] }}
      >
        <Text size={ui.size} leading={ui.leading} numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
          {m?.year ? (
            <Text size={ui.size} leading={ui.leading} color="text-3">
              {` ${m.year}`}
            </Text>
          ) : null}
        </Text>
        {m && !m.file ? <Badge>{t('noFile')}</Badge> : null}
      </View>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon="close"
        accessibilityLabel={t('removeFrom', { title, label: label.toLowerCase() })}
        onPress={onRemove}
      />
    </>
  )
}
