'use client'
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
// SPDX-License-Identifier: AGPL-3.0-only
// The featured-section composer (A11, curation.md#section-composer; checkpoint 8c), ported from
// the prototype's curation/section-editor.tsx: a title, a layout, where its titles come from
// (picked by hand, or a rule that keeps itself fresh), hero taglines, who sees it and when, beside
// the live client preview. What a source picks comes from `POST /curation/sections/resolve`; the
// picker searches the library (`GET /movies?title=`) and offers titles with a file.
import { admin, line } from '@highsea-tv/tokens'
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Press,
  SearchField,
  SegmentedControl,
  Select,
  SortableList,
  Text,
  toast,
  tokens,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ReactNode, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Thumb, useRuleOptions, useSortMessages } from './curation.tsx'
import { ClientPreview } from './curation-preview.tsx'
import {
  AudienceField,
  audienceError,
  ComposerActions,
  ComposerColumns,
  FieldGroup,
  GroupError,
  Hint,
  Pair,
  ScheduleField,
  useCurationT,
  useKept,
  useSettled,
} from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { useRouter } from './navigation.tsx'
import { AdminPage } from './shell.tsx'
import { useNow } from './time.ts'

const sp = tokens.space
const ui = tokens.adminText.ui

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
    <ComposerColumns
      label={t('section.form')}
      form={
        <>
          <View style={{ gap: sp['4'] }}>
            <Field label={t('field.title')} error={show(errors.title)}>
              <Input
                value={draft.title}
                maxLength={60}
                onChangeText={(title) => set({ title })}
                onSubmitEditing={submit}
                placeholder={t('field.sectionPlaceholder')}
              />
            </Field>
            <Field label={t('field.after')} hint={t('field.afterHint')}>
              <Input
                value={draft.tagline ?? ''}
                maxLength={60}
                onChangeText={(v) => set({ tagline: v || null })}
                onSubmitEditing={submit}
                placeholder={t('field.afterPlaceholder')}
              />
            </Field>
            <View style={{ gap: sp['2'] }}>
              <Text size={ui.size} leading={ui.leading} weight={500} aria-hidden>
                {t('layout')}
              </Text>
              <SegmentedControl
                aria-label={t('layout')}
                size="sm"
                value={draft.layout}
                onValueChange={(v) => set({ layout: v as FeaturedLayout })}
                options={LAYOUTS.map((l) => ({ value: l, label: t(`layout.${l}`) }))}
              />
              <Hint>{t(`layoutHint.${draft.layout}`)}</Hint>
            </View>
          </View>

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

          <ComposerActions>
            <Button variant="primary" loading={save.pending} onPress={submit}>
              {initial ? t('saveChanges') : t('addToHome')}
            </Button>
            <Button variant="ghost" href="/curation/featured">
              {t('cancel')}
            </Button>
            {initial && (
              <View style={{ marginStart: 'auto' }}>
                <Button variant="danger-ghost" icon="delete" onPress={() => setConfirm(true)}>
                  {t('delete')}
                </Button>
              </View>
            )}
          </ComposerActions>
          {initial && (
            <ConfirmDialog
              open={confirm}
              onClose={() => setConfirm(false)}
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
        </>
      }
      preview={
        <ClientPreview
          draft={preview}
          what={t('thisSection')}
          note={t('noAnnouncements')}
          reveal={initial?.id ?? 'draft'}
        />
      }
    />
  )
}

// ---------------------------------------------------------------- source

/** A well round the rule's picks (s2, a line round it). */
function Well({ children, live }: { children: ReactNode; live?: boolean }) {
  const theme = useTheme()
  return (
    <View
      aria-live={live ? 'polite' : undefined}
      style={{
        gap: sp['2'],
        padding: sp['3'],
        borderRadius: tokens.radius.md,
        borderWidth: line.thin,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.s2,
      }}
    >
      {children}
    </View>
  )
}

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
  const value =
    s.kind === 'rule' && s.rule === 'recently-added' ? (
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
    ) : s.kind === 'rule' && s.rule === 'genre' ? (
      <Field label={t('genre')} hint={options.data?.genres.length ? undefined : t('noGenres')}>
        <Select
          value={s.value}
          onValueChange={(value) => set({ source: { ...s, value } })}
          options={(options.data?.genres ?? (s.value ? [s.value] : [])).map((g) => ({
            value: g,
            label: g,
          }))}
        />
      </Field>
    ) : s.kind === 'rule' && s.rule === 'collection' ? (
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
    ) : null
  return (
    <FieldGroup label={t('titles')} gap={sp['3']}>
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
      />
      {s.kind === 'manual' ? (
        <Picker
          ids={s.itemIds}
          picked={picks?.items ?? []}
          onChange={(itemIds) => set({ source: { kind: 'manual', itemIds } })}
        />
      ) : (
        <Pair
          first={
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
          }
          second={value}
        />
      )}
      <GroupError>{error}</GroupError>
      {s.kind === 'rule' && (
        <Well live>
          <Text variant="caption" color="text-2">
            {resolved.status === 'error'
              ? resolved.error.message
              : picks
                ? picks.total === 0
                  ? t('picks.none')
                  : t('picks.some', { count: picks.total })
                : t('picks.checking')}
          </Text>
          {picks && picks.items.length > 0 && (
            <View
              role="list"
              style={{ flexDirection: 'row', gap: sp['1'] + sp['0.5'], overflow: 'hidden' }}
            >
              {picks.items.slice(0, 8).map((m) => (
                <View key={m.id} role="listitem">
                  <Thumb
                    title={m.title}
                    src={m.art.poster}
                    width={admin.curationSection.thumb}
                    fill="s3"
                  />
                </View>
              ))}
            </View>
          )}
        </Well>
      )}
    </FieldGroup>
  )
}

/** A title and its year, the year quieter, on one line. */
function TitleYear({ title, year }: { title: string; year: number | null }) {
  return (
    <Text size={ui.size} leading={ui.leading} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
      {title}{' '}
      <Text size={ui.size} leading={ui.leading} color="text-3">
        {year ?? ''}
      </Text>
    </Text>
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
  const sortMessages = useSortMessages()
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
    <View style={{ gap: sp['3'] }}>
      {picked.length > 0 && (
        <SortableList
          accessibilityLabel={t('picked')}
          messages={sortMessages}
          items={picked}
          id={(m) => String(m.id)}
          label={(m) => m.title}
          onChange={(next) => onChange(next.map((m) => m.id))}
        >
          {(m, handle) => (
            <>
              {handle}
              <Thumb
                title={m.title}
                src={m.art.poster}
                width={admin.curationSection.thumbSmall}
                label=""
                fill="s3"
              />
              <TitleYear title={m.title} year={m.year} />
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="close"
                accessibilityLabel={t('remove', { title: m.title })}
                onPress={() => onChange(ids.filter((x) => x !== m.id))}
              />
            </>
          )}
        </SortableList>
      )}
      <Field label={t('addTitles')} hint={t('addTitlesHint')}>
        <SearchField
          label={t('addTitles')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchLibrary')}
        />
      </Field>
      {q !== '' && search.status === 'success' && (
        <View role="list" aria-label={t('matching')} aria-live="polite" style={{ gap: sp['1'] }}>
          {matches.length === 0 ? (
            <View role="listitem" style={{ paddingHorizontal: sp['1'] }}>
              <Hint>{t('noMatch', { query: q })}</Hint>
            </View>
          ) : (
            matches.map((m) => (
              <View key={m.id} role="listitem">
                <Match
                  title={m.title}
                  year={m.year}
                  onPress={() => {
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
                        watched: false,
                        tagline: null,
                      },
                    ])
                    onChange([...ids, m.id])
                    setQuery('')
                  }}
                />
              </View>
            ))
          )}
        </View>
      )}
    </View>
  )
}

/** A search result: the title and year, and Add at its end, s2 under a pointer. */
function Match({
  title,
  year,
  onPress,
}: {
  title: string
  year: number | null
  onPress: () => void
}) {
  const theme = useTheme()
  const t = useCurationT()
  return (
    <Press
      onPress={onPress}
      style={({ hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: sp['2'],
        paddingHorizontal: sp['2'],
        paddingVertical: sp['1'] + sp['0.5'],
        borderRadius: tokens.radius.md,
        backgroundColor: hovered ? theme.colors.s2 : 'transparent',
      })}
    >
      <TitleYear title={title} year={year} />
      <Text variant="caption" color="accent-text">
        {t('add')}
      </Text>
    </Press>
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
    <FieldGroup label={t('taglines')} gap={sp['3']}>
      <Hint>{t('taglinesHint')}</Hint>
      {items.slice(0, 6).map((m) => (
        <Field key={m.id} label={m.title}>
          <Input
            value={value(m.id)}
            maxLength={120}
            placeholder={m.synopsis}
            onChangeText={(v) => change(m.id, v)}
          />
        </Field>
      ))}
    </FieldGroup>
  )
}
