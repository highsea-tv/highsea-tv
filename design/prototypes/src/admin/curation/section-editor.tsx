// SPDX-License-Identifier: AGPL-3.0-only
// The featured-section composer (A11, docs/product/curation.md#section-composer): a title, a
// layout, where its titles come from (picked by hand, or a rule that keeps itself fresh), hero
// taglines, who sees it and when, beside the live client preview.
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  toast,
} from '@highsea/ui-web'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { SortableList } from '../../kit/sortable-list.tsx'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type { ClientItem, CurationPreview, FeaturedSection, MediaItem } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'
import { layoutLabels } from './curation.tsx'
import { ClientPreview } from './preview.tsx'
import { AudienceField, audienceError, LIVE_IN_PREVIEW, ScheduleField } from './shared.tsx'

type Rule = Extract<FeaturedSection['source'], { kind: 'rule' }>['rule']

const layoutHints: Record<FeaturedSection['layout'], string> = {
  hero: 'The top of every home screen: big artwork, the title and Play. The first hero in the order fills it; another shows as a row.',
  row: 'A row of posters.',
  spotlight: 'Wider cards with a line of synopsis, for a theme. Phones show it as a row.',
}

const ruleLabels: Record<Rule, string> = {
  'recently-added': 'Recently added',
  genre: 'A genre',
  collection: 'A collection',
  filter: 'A saved filter',
}

const ruleDefaults: Record<Rule, string> = {
  'recently-added': '30d',
  genre: 'Comedy',
  collection: 'caminandes',
  filter: 'year < 1930',
}

function blank(now: number): FeaturedSection {
  return {
    id: `fs-${now.toString(36)}`,
    title: '',
    tagline: null,
    layout: 'row',
    source: { kind: 'manual', itemIds: [] },
    overrides: [],
    audience: { kind: 'everyone' },
    schedule: { start: new Date(now).toISOString(), end: null },
    order: 999,
  }
}

export function SectionEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const existing = useQuery(`curation:section:${id}`, (c) =>
    isNew ? Promise.resolve(null) : c.curation.section(id),
  )
  return (
    <AdminPage title={isNew ? 'New featured section' : 'Edit featured section'}>
      <Loadable query={existing} what="the featured section">
        {(f) => <Composer initial={f} />}
      </Loadable>
    </AdminPage>
  )
}

/** What the source picks right now, fetched as the draft settles. */
function useResolved(draft: FeaturedSection) {
  const [settled, setSettled] = useState(draft)
  useEffect(() => {
    const t = setTimeout(() => setSettled(draft), 150)
    return () => clearTimeout(t)
  }, [draft])
  const query = useQuery(`curation:resolve:${JSON.stringify(settled.source)}`, (c) =>
    c.curation.resolve(settled),
  )
  // while a changed source loads, keep showing what the last one picked, so the form doesn't
  // collapse and jump on every reorder
  const last = useRef(query.data)
  if (query.status === 'success') last.current = query.data
  return query.status === 'loading' && last.current
    ? { ...query, status: 'success' as const, data: last.current, error: undefined }
    : query
}

function Composer({ initial }: { initial: FeaturedSection | null }) {
  const now = useNow()
  const [, navigate] = useLocation()
  const [draft, setDraft] = useState<FeaturedSection>(() => initial ?? blank(now))
  const [tried, setTried] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const snapshot = useQuery('curation:snapshot', (c) => c.curation.snapshot())
  const resolved = useResolved(draft)
  const save = useAction((c, f: FeaturedSection) => c.curation.saveSection(f))
  const remove = useAction((c, id: string) => c.curation.deleteSection(id))
  const set = (patch: Partial<FeaturedSection>) => setDraft((d) => ({ ...d, ...patch }))

  const errors = {
    title: !draft.title.trim() ? 'Give the section a title. It shows above its titles.' : undefined,
    source:
      draft.source.kind === 'manual' && !draft.source.itemIds.length
        ? 'Add at least one title.'
        : undefined,
    audience: audienceError(draft.audience),
    schedule:
      draft.schedule.end && Date.parse(draft.schedule.end) <= Date.parse(draft.schedule.start)
        ? 'The end has to come after the start.'
        : undefined,
  }
  const show = (e: string | undefined) => (tried ? e : undefined)

  const preview = useMemo<CurationPreview>(() => {
    const saved = snapshot.data ?? { announcements: [], featured: [] }
    const order = saved.featured.find((f) => f.id === draft.id)?.order ?? saved.featured.length
    // shown as if it were live now, in its place in the order
    const live = {
      ...draft,
      order,
      schedule: LIVE_IN_PREVIEW,
    }
    return {
      // the home screen alone: announcements would sit over the sections being previewed
      announcements: [],
      featured: [...saved.featured.filter((f) => f.id !== draft.id), live],
    }
  }, [draft, snapshot.data])

  const submit = () => {
    setTried(true)
    if (Object.values(errors).some(Boolean)) return
    save
      .run(draft)
      .then((f) => {
        toast.success(`“${f.title}” saved`, {
          description: 'Every home screen in its audience shows it now.',
        })
        navigate('/curation/featured')
      })
      .catch((e: Error) => toast.error('Couldn’t save the section', { description: e.message }))
  }

  return (
    <div className="grid gap-6 expanded:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] expanded:items-start">
      <form
        aria-label="Featured section"
        className="grid gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid gap-4">
          <Field label="Title" error={show(errors.title)}>
            <Input
              value={draft.title}
              maxLength={60}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Staff picks"
            />
          </Field>
          <Field
            label="After the title"
            hint="Optional, in a lighter weight: who picked it, or what ties it together."
          >
            <Input
              value={draft.tagline ?? ''}
              maxLength={60}
              onChange={(e) => set({ tagline: e.target.value || null })}
              placeholder="by Ines"
            />
          </Field>
          <div className="grid gap-2">
            <span className="font-medium text-text text-ui">Layout</span>
            <SegmentedControl
              aria-label="Layout"
              size="sm"
              value={draft.layout}
              onValueChange={(v) => set({ layout: v as FeaturedSection['layout'] })}
              options={(['hero', 'row', 'spotlight'] as const).map((l) => ({
                value: l,
                label: layoutLabels[l],
              }))}
              className="justify-self-start"
            />
            <p className="text-caption text-text-3">{layoutHints[draft.layout]}</p>
          </div>
        </div>

        <Source draft={draft} set={set} error={show(errors.source)} resolved={resolved} />

        {draft.layout === 'hero' && resolved.status === 'success' && resolved.data.length > 0 && (
          <Taglines draft={draft} set={set} items={resolved.data} />
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
            {initial ? 'Save changes' : 'Add to home'}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <a href={adminHref('/curation/featured')}>Cancel</a>
          </Button>
          {initial && (
            <Button
              type="button"
              variant="ghost"
              icon="delete"
              className="ms-auto text-danger"
              onClick={() => setConfirm(true)}
            >
              Delete
            </Button>
          )}
        </div>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={`Delete “${draft.title}”?`}
          description="It leaves every home screen. The titles in it stay in the library."
          confirmLabel="Delete"
          destructive
          onConfirm={() =>
            remove.run(draft.id).then(() => {
              toast({ title: `“${draft.title}” deleted` })
              navigate('/curation/featured')
            })
          }
        />
      </form>
      <div className="expanded:sticky expanded:top-4">
        <ClientPreview
          preview={preview}
          draftId={draft.id}
          audience={draft.audience}
          what="this section"
          note="Announcements are left out."
          reveal={draft.id}
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
  draft: FeaturedSection
  set: (patch: Partial<FeaturedSection>) => void
  error?: string
  resolved: ReturnType<typeof useResolved>
}) {
  const options = useQuery('curation:rule-options', (c) => c.curation.ruleOptions())
  const s = draft.source
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1.5 font-medium text-text text-ui">Titles</legend>
      <SegmentedControl
        aria-label="Where the titles come from"
        size="sm"
        value={s.kind}
        onValueChange={(k) =>
          set({
            source:
              k === 'manual'
                ? { kind: 'manual', itemIds: resolved.data?.map((m) => m.id) ?? [] }
                : { kind: 'rule', rule: 'recently-added', value: ruleDefaults['recently-added'] },
          })
        }
        options={[
          { value: 'manual', label: 'Pick them' },
          { value: 'rule', label: 'Use a rule' },
        ]}
        className="justify-self-start"
      />
      {s.kind === 'manual' ? (
        <Picker
          ids={s.itemIds}
          onChange={(itemIds) => set({ source: { kind: 'manual', itemIds } })}
        />
      ) : (
        <div className="grid gap-3 medium:grid-cols-2">
          <Field label="Rule">
            <Select
              value={s.rule}
              onValueChange={(r) =>
                set({ source: { kind: 'rule', rule: r as Rule, value: ruleDefaults[r as Rule] } })
              }
              options={(Object.keys(ruleLabels) as Rule[]).map((r) => ({
                value: r,
                label: ruleLabels[r],
              }))}
            />
          </Field>
          {s.rule === 'recently-added' && (
            <Field label="Added in the last">
              <Select
                value={s.value}
                onValueChange={(value) => set({ source: { ...s, value } })}
                options={[
                  { value: '7d', label: '7 days' },
                  { value: '30d', label: '30 days' },
                  { value: '90d', label: '90 days' },
                ]}
              />
            </Field>
          )}
          {s.rule === 'genre' && (
            <Field label="Genre">
              <Select
                value={s.value}
                onValueChange={(value) => set({ source: { ...s, value } })}
                options={(options.data?.genres ?? [s.value]).map((g) => ({ value: g, label: g }))}
              />
            </Field>
          )}
          {s.rule === 'collection' && (
            <Field label="Collection">
              <Select
                value={s.value}
                onValueChange={(value) => set({ source: { ...s, value } })}
                options={(options.data?.collections ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Field>
          )}
          {s.rule === 'filter' && (
            <Field label="Filter" hint="As in the library’s filter bar: year < 1930.">
              <Input
                value={s.value}
                onChange={(e) => set({ source: { ...s, value: e.target.value } })}
                className="font-mono"
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
            {resolved.status === 'success'
              ? resolved.data.length === 0
                ? 'Nothing matches right now. The section stays hidden until something does.'
                : `Right now this picks ${resolved.data.length} ${resolved.data.length === 1 ? 'title' : 'titles'}, and keeps up as the library changes.`
              : 'Checking what it picks…'}
          </p>
          {resolved.status === 'success' && resolved.data.length > 0 && (
            <ul className="flex gap-1.5 overflow-hidden">
              {resolved.data.slice(0, 8).map((m) => (
                <li key={m.id} className="w-10 shrink-0">
                  <img
                    src={m.art.poster}
                    alt={m.title}
                    className="aspect-poster w-full rounded-[4px] object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  )
}

/** Titles picked by hand: search the playable library, then order them. */
function Picker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const library = useQuery('curation:titles', (c) => c.movies.list())
  const [query, setQuery] = useState('')
  const all = (library.data ?? []).filter((m) => m.versions.some((v) => v.fileId))
  const byId = (id: string) => all.find((m) => m.id === id)
  const q = query.trim().toLowerCase()
  const matches: MediaItem[] = q
    ? all.filter((m) => !ids.includes(m.id) && m.title.toLowerCase().includes(q)).slice(0, 6)
    : []
  const picked = ids.flatMap((id) => {
    const m = byId(id)
    return m ? [m] : []
  })
  return (
    <div className="grid gap-3">
      {picked.length > 0 && (
        <SortableList
          aria-label="Picked titles"
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
              <img
                src={m.art.poster}
                alt=""
                className="aspect-poster w-8 rounded-[4px] object-cover"
              />
              <span className="truncate text-text text-ui">
                {m.title} <span className="text-text-3">{m.year}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="close"
                aria-label={`Remove ${m.title}`}
                onClick={() => onChange(ids.filter((x) => x !== m.id))}
              />
            </>
          )}
        </SortableList>
      )}
      <Field label="Add titles" hint="Only titles people can play show up.">
        <Input
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library"
        />
      </Field>
      {q && (
        <ul aria-label="Matching titles" aria-live="polite" className="grid gap-1">
          {matches.length === 0 ? (
            <li className="px-1 text-caption text-text-3">No playable title matches “{query}”.</li>
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
    </div>
  )
}

/** Hero only: a tagline per title, in place of its synopsis. */
function Taglines({
  draft,
  set,
  items,
}: {
  draft: FeaturedSection
  set: (patch: Partial<FeaturedSection>) => void
  items: ClientItem[]
}) {
  const value = (id: string) => draft.overrides.find((o) => o.itemId === id)?.tagline ?? ''
  const change = (id: string, tagline: string) =>
    set({
      overrides: [
        ...draft.overrides.filter((o) => o.itemId !== id),
        ...(tagline ? [{ itemId: id, artwork: null, tagline }] : []),
      ],
    })
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1.5 font-medium text-text text-ui">Taglines on the hero</legend>
      <p className="text-caption text-text-3">
        A line of your own in place of the synopsis. Leave it empty to use the synopsis.
      </p>
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
