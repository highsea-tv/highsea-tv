// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Import lists (settings.md; ADR 0045), as apps/server built it (lists.tsx): each list's
// row keeps its switch, name, kind, titles, whether it searches and its quality profile, and adds
// the last check's result with Edit, Check now and Remove. Add a list and Edit open one form whose
// fields follow the kind (TMDB, Trakt or a generic JSON list). Trakt's account, connected with a
// device code, and the exclusions are groups below. Changes save at once. Since stage 6 (drawn for
// the TV series phase) a TMDB or Trakt list adds movies or shows, each into its kind's folders; a
// list of shows says which episodes the shows it adds watch for, in place of Minimum availability.
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Switch,
  toast,
} from '@highsea-tv/ui-web'
import { useEffect, useState } from 'react'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { TraktDeviceCode } from '../../mock/lists.ts'
import type { ListExclusion, TraktStatus } from '../../mock/settings.ts'
import type {
  ImportList,
  ImportListInput,
  ImportListSettings,
  MinimumAvailability,
  ShowMonitor,
} from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { fieldOf, TagPicker, useAgo } from './parts.tsx'
import { AreaPage, Group } from './settings.tsx'

type Kind = ImportListSettings['kind']
type Adds = ImportList['kind']
type TmdbSource = Extract<ImportListSettings, { kind: 'tmdb' }>['source']
type TraktSource = Extract<ImportListSettings, { kind: 'trakt' }>['source']
type Test = { ok: boolean; message: string; found: number }

const KINDS: [Kind, string][] = [
  ['tmdb', 'TMDB'],
  ['trakt', 'Trakt'],
  ['generic', 'Generic list'],
]
const TMDB_SOURCES: Record<Adds, TmdbSource[]> = {
  movies: ['list', 'popular', 'top-rated', 'upcoming', 'now-playing'],
  shows: ['list', 'popular', 'top-rated', 'on-the-air', 'airing-today'],
}
const TRAKT_SOURCES: TraktSource[] = ['list', 'trending', 'popular', 'anticipated', 'watchlist']
const SOURCE: Record<TmdbSource | TraktSource, string> = {
  list: 'A list',
  popular: 'Popular',
  'top-rated': 'Top rated',
  upcoming: 'Upcoming',
  'now-playing': 'Now playing',
  'on-the-air': 'On the air',
  'airing-today': 'Airing today',
  trending: 'Trending',
  anticipated: 'Anticipated',
  watchlist: 'Your watchlist',
}
const AVAILABILITY: [MinimumAvailability, string][] = [
  ['announced', 'Announced'],
  ['in-cinemas', 'In cinemas'],
  ['released', 'Released'],
]

/** Which episodes a show the list adds watches for, as Add a show's Monitor. */
const MONITOR: [ShowMonitor, string][] = [
  ['all', 'Every episode'],
  ['future', 'Episodes yet to air'],
  ['missing', 'Episodes without a file'],
  ['first-season', 'The first season'],
  ['none', 'None'],
]

const titles = (n: number) => `${n} ${n === 1 ? 'title' : 'titles'}`

/** What the form offers: each kind's folders and both kinds of profile. */
type Options = {
  folders: Record<Adds, string[]>
  quality: { id: string; name: string }[]
  language: { id: string; name: string }[]
}

function useOptions() {
  return useQuery(
    'import-lists:options',
    async (c): Promise<Options> => {
      const [folders, quality, language] = await Promise.all([
        c.rootFolders.list(),
        c.movies.qualityProfiles(),
        c.movies.languageProfiles(),
      ])
      const of = (kind: Adds) => folders.filter((f) => f.kind === kind).map((f) => f.path)
      return {
        folders: { movies: of('movies'), shows: of('shows') },
        quality: quality.map((p) => ({ id: p.id, name: p.name })),
        language: language.map((p) => ({ id: p.id, name: p.name })),
      }
    },
    ['settings.updated'],
  )
}

/** The list's input, from a saved list: what Edit and the row's quick changes send back. */
const inputOf = (l: ImportList): ImportListInput => ({
  kind: l.kind,
  name: l.name,
  enabled: l.enabled,
  settings: l.settings,
  rootFolder: l.rootFolder,
  qualityProfileId: l.qualityProfileId,
  languageProfileId: l.languageProfileId,
  monitored: l.monitored,
  minimumAvailability: l.minimumAvailability,
  searchOnAdd: l.searchOnAdd,
  ...(l.kind === 'shows' ? { monitor: l.monitor ?? 'all' } : {}),
  tags: l.tags,
})

/** "Trakt · Your watchlist", "TMDB · Popular", "Generic list". */
const kindLabel = (s: ImportListSettings) =>
  s.kind === 'generic'
    ? 'Generic list'
    : `${s.kind === 'tmdb' ? 'TMDB' : 'Trakt'} · ${SOURCE[s.source]}`

export function ImportLists() {
  const lists = useQuery('import-lists', (c) => c.importLists.list(), ['settings.updated'])
  const trakt = useQuery('import-lists:trakt', (c) => c.importLists.trakt(), ['settings.updated'])
  const options = useOptions()
  // null: closed; 'new': Add a list; a list: Edit
  const [editing, setEditing] = useState<ImportList | 'new' | null>(null)
  const [removing, setRemoving] = useState<ImportList | null>(null)
  const remove = useAction((c, id: string) => c.importLists.remove(id))

  return (
    <AreaPage id="lists">
      <Group
        title="Lists"
        description="highsea checks each list every 6 hours and adds new movies and shows from it."
      >
        <Loadable query={lists} what="the import lists">
          {(ls) =>
            ls.length === 0 ? (
              <EmptyState icon="bookmark" title="No lists yet">
                Add a TMDB list, a Trakt list or watchlist, or any list of movies in the generic
                format.
              </EmptyState>
            ) : (
              <ul aria-label="Lists" className="grid gap-2">
                {ls.map((l) => (
                  <Row
                    key={l.id}
                    list={l}
                    profiles={options.data?.quality ?? []}
                    onEdit={() => setEditing(l)}
                    onRemove={() => setRemoving(l)}
                  />
                ))}
              </ul>
            )
          }
        </Loadable>
        <Button
          icon="add"
          className="justify-self-start"
          disabled={!options.data}
          onClick={() => setEditing('new')}
        >
          Add a list
        </Button>
      </Group>
      <Trakt status={trakt.data} />
      <Exclusions />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && options.data && (
          <ListForm
            key={editing === 'new' ? 'new' : editing.id}
            list={editing === 'new' ? null : editing}
            options={options.data}
            trakt={trakt.data}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        description="highsea stops checking it. What it added stays in the library."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          const l = removing
          if (l)
            remove.run(l.id).then(
              () => toast({ title: `${l.name} removed` }),
              (e: Error) => toast.error('That didn’t work', { description: e.message }),
            )
        }}
      />
    </AreaPage>
  )
}

function Row({
  list: l,
  profiles,
  onEdit,
  onRemove,
}: {
  list: ImportList
  profiles: Options['quality']
  onEdit: () => void
  onRemove: () => void
}) {
  const ago = useAgo()
  const update = useAction((c, body: ImportListInput) => c.importLists.update(l.id, body))
  const sync = useAction((c) => c.importLists.sync(l.id))
  const change = (patch: Partial<ImportListInput>) =>
    update
      .run({ ...inputOf(l), ...patch })
      .catch((e: Error) => toast.error('Couldn’t save the list', { description: e.message }))
  const r = l.lastResult
  return (
    <li className="grid gap-3 rounded-md border border-line bg-s2 p-3">
      <div className="grid gap-3 medium:grid-cols-[auto_minmax(0,1fr)_14rem] medium:items-center">
        <Switch
          aria-label={`${l.name}: on`}
          checked={l.enabled}
          disabled={update.pending}
          onCheckedChange={(enabled) => change({ enabled })}
        />
        <div className="grid min-w-0 gap-0.5">
          <p className="text-text text-ui [overflow-wrap:anywhere]">{l.name}</p>
          <p className="text-caption text-text-3">
            {l.kind === 'shows' ? 'Shows' : 'Movies'} · {kindLabel(l.settings)} · {titles(l.items)}{' '}
            · {l.searchOnAdd ? 'adds and searches' : 'adds without searching'}
          </p>
        </div>
        <Select
          aria-label={`${l.name}: quality profile`}
          value={l.qualityProfileId}
          disabled={update.pending}
          onValueChange={(qualityProfileId) => change({ qualityProfileId })}
          options={profiles.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
      <div className="grid gap-1 text-caption text-text-3">
        <p>
          {l.lastSync ? `Checked ${ago(l.lastSync)}` : 'Not checked yet'}
          {r && !r.error && (
            <>
              {' · '}
              {titles(r.found)}: {r.added} added, {r.skipped} already here or excluded
            </>
          )}
        </p>
        {r?.error && (
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">The last check failed: {r.error}</Badge>
          </p>
        )}
        {r && r.unresolved.length > 0 && (
          <p className="[overflow-wrap:anywhere]">
            Couldn’t match on TMDB: {r.unresolved.join(', ')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="edit" aria-label={`Edit ${l.name}`} onClick={onEdit}>
          Edit
        </Button>
        <Button
          size="sm"
          icon="refresh"
          loading={sync.pending}
          aria-label={`Check ${l.name} now`}
          onClick={() =>
            sync.run().then(
              () =>
                toast({
                  title: `Checking ${l.name}`,
                  description: `New titles appear in ${l.kind === 'shows' ? 'Shows' : 'Movies'}.`,
                }),
              (e: Error) => toast.error('That didn’t work', { description: e.message }),
            )
          }
        >
          Check now
        </Button>
        <Button size="sm" variant="danger" aria-label={`Remove ${l.name}`} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------- Add a list, Edit

type Draft = {
  kind: Kind
  tmdbSource: TmdbSource
  traktSource: TraktSource
  list: string
  url: string
  rest: Omit<ImportListInput, 'settings'>
}

function draftOf(list: ImportList | null, o: Options): Draft {
  const s = list?.settings
  return {
    kind: s?.kind ?? 'tmdb',
    tmdbSource: s?.kind === 'tmdb' ? s.source : 'list',
    traktSource: s?.kind === 'trakt' ? s.source : 'list',
    list: s && s.kind !== 'generic' ? (s.list ?? '') : '',
    url: s?.kind === 'generic' ? s.url : '',
    rest: list
      ? (({ settings: _, ...r }) => r)(inputOf(list))
      : {
          kind: 'movies',
          name: '',
          enabled: true,
          rootFolder: o.folders.movies[0] ?? '',
          qualityProfileId: (o.quality.find((p) => p.id === 'qp-hd') ?? o.quality[0])?.id ?? '',
          languageProfileId: null,
          monitored: true,
          minimumAvailability: 'released',
          searchOnAdd: false,
          tags: [],
        },
  }
}

function settingsOf(d: Draft): ImportListSettings {
  if (d.kind === 'generic') return { kind: 'generic', url: d.url.trim() }
  if (d.kind === 'tmdb')
    return d.tmdbSource === 'list'
      ? { kind: 'tmdb', source: 'list', list: d.list.trim() }
      : { kind: 'tmdb', source: d.tmdbSource }
  return d.traktSource === 'list'
    ? { kind: 'trakt', source: 'list', list: d.list.trim() }
    : { kind: 'trakt', source: d.traktSource }
}

/** The fields a refused save can name; anything else shows below the form. */
const FORM_FIELDS = ['name', 'url', 'list', 'source', 'kind', 'rootFolder', 'qualityProfileId']

function ListForm({
  list,
  options: o,
  trakt,
  onClose,
}: {
  list: ImportList | null
  options: Options
  trakt: TraktStatus | undefined
  onClose: () => void
}) {
  const [d, setD] = useState(() => draftOf(list, o))
  const [touched, setTouched] = useState(false)
  const [failure, setFailure] = useState<{ field?: string; message: string } | null>(null)
  const [tested, setTested] = useState<Test | null>(null)
  const save = useAction((c, body: ImportListInput) =>
    list ? c.importLists.update(list.id, body) : c.importLists.add(body),
  )
  const test = useAction((c, settings: ImportListSettings) =>
    c.importLists.test(settings, d.rest.kind),
  )
  const adds = d.rest.kind
  const folders = o.folders[adds]
  const noun = adds === 'shows' ? 'show' : 'movie'
  /** Movies or shows: the folder follows, a generic list becomes TMDB, and a chart the kind lacks its first. */
  const setAdds = (kind: Adds) => {
    setTested(null)
    setFailure(null)
    setD((old) => ({
      ...old,
      kind: kind === 'shows' && old.kind === 'generic' ? 'tmdb' : old.kind,
      tmdbSource: TMDB_SOURCES[kind].includes(old.tmdbSource) ? old.tmdbSource : 'popular',
      rest: {
        ...old.rest,
        kind,
        rootFolder: o.folders[kind][0] ?? '',
        monitor: kind === 'shows' ? (old.rest.monitor ?? 'all') : undefined,
      },
    }))
  }
  const set = (patch: Partial<Draft>) => {
    setTested(null)
    setFailure(null)
    setD((old) => ({ ...old, ...patch }))
  }
  const setRest = (patch: Partial<Draft['rest']>) => {
    setFailure(null)
    setD((old) => ({ ...old, rest: { ...old.rest, ...patch } }))
  }

  const needsList =
    (d.kind === 'tmdb' && d.tmdbSource === 'list') ||
    (d.kind === 'trakt' && d.traktSource === 'list')
  const missing = {
    name: !d.rest.name.trim(),
    list: needsList && !d.list.trim(),
    url: d.kind === 'generic' && !d.url.trim(),
    folder: !d.rest.rootFolder,
  }
  const traktOff = d.kind === 'trakt' && trakt?.available === false
  const needsAccount = d.kind === 'trakt' && d.traktSource === 'watchlist' && !trakt?.account
  const blocked = traktOff || needsAccount
  const sourceOk = !missing.list && !missing.url && !blocked

  const submit = async () => {
    setTouched(true)
    setFailure(null)
    if (Object.values(missing).some(Boolean) || blocked) return
    try {
      const { monitor, ...rest } = d.rest
      const saved = await save.run({
        ...rest,
        name: d.rest.name.trim(),
        settings: settingsOf(d),
        // a list of shows watches for the episodes its Monitor picks
        ...(adds === 'shows'
          ? { monitor: monitor ?? 'all', monitored: (monitor ?? 'all') !== 'none' }
          : {}),
      })
      onClose()
      if (list) toast.success(`${saved.name} saved`)
      else
        toast.success(`${saved.name} added`, {
          description: 'highsea checks it now, then every 6 hours.',
        })
    } catch (e) {
      setFailure({ field: fieldOf(e), message: (e as Error).message })
    }
  }

  const onTest = () =>
    test
      .run(settingsOf(d))
      .then(setTested, (e: Error) => setTested({ ok: false, message: e.message, found: 0 }))

  const err = (field: string, isMissing: boolean) =>
    failure?.field === field ? failure.message : touched && isMissing ? 'Fill this in' : undefined
  const sourceError = err('list', missing.list)
  const sourceProblem =
    failure?.field === 'source' || failure?.field === 'kind' ? failure.message : undefined

  return (
    <DialogContent
      size="md"
      title={list ? `Edit ${list.name}` : 'Add a list'}
      description={`${adds === 'shows' ? 'Shows' : 'Movies'} on the list are added with the folder and profiles below.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.pending} disabled={blocked} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="grid gap-4 medium:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field
          label="It adds"
          hint={adds === 'shows' ? 'TMDB and Trakt lists can hold shows.' : undefined}
          className="medium:col-span-2"
        >
          <SegmentedControl
            aria-label="It adds"
            value={adds}
            onValueChange={(kind) => setAdds(kind as Adds)}
            options={[
              { value: 'movies', label: 'Movies' },
              { value: 'shows', label: 'Shows' },
            ]}
          />
        </Field>
        <Field label="Where the list lives" className="medium:col-span-2">
          <SegmentedControl
            aria-label="Where the list lives"
            value={d.kind}
            onValueChange={(kind) => set({ kind: kind as Kind })}
            options={KINDS.filter(([value]) => adds === 'movies' || value !== 'generic').map(
              ([value, label]) => ({ value, label }),
            )}
          />
        </Field>
        {d.kind === 'tmdb' && (
          <>
            <Field
              label="List"
              hint={
                d.tmdbSource === 'list'
                  ? undefined
                  : 'TMDB’s chart for the server’s region; highsea takes its top 20.'
              }
              className="medium:col-span-2"
            >
              <Select
                value={d.tmdbSource}
                onValueChange={(v) => set({ tmdbSource: v as TmdbSource })}
                options={TMDB_SOURCES[adds].map((s) => ({ value: s, label: SOURCE[s] }))}
              />
            </Field>
            {d.tmdbSource === 'list' && (
              <Field
                label="TMDB list"
                hint="Its number, or its address on themoviedb.org."
                error={sourceError}
                className="medium:col-span-2"
              >
                <Input
                  value={d.list}
                  spellCheck={false}
                  autoCapitalize="none"
                  className="font-mono"
                  onChange={(e) => set({ list: e.target.value })}
                />
              </Field>
            )}
          </>
        )}
        {d.kind === 'trakt' && (
          <>
            <Field
              label="List"
              hint={
                traktOff
                  ? undefined
                  : d.traktSource === 'watchlist'
                    ? 'The watchlist of the Trakt account connected below.'
                    : d.traktSource === 'list'
                      ? undefined
                      : 'Trakt’s chart; highsea takes its top 20.'
              }
              error={
                traktOff
                  ? 'This build of highsea has no Trakt application, so Trakt can’t be used.'
                  : needsAccount
                    ? 'Connect a Trakt account below to use its watchlist.'
                    : sourceProblem
              }
              className="medium:col-span-2"
            >
              <Select
                value={d.traktSource}
                onValueChange={(v) => set({ traktSource: v as TraktSource })}
                options={TRAKT_SOURCES.map((s) => ({ value: s, label: SOURCE[s] }))}
              />
            </Field>
            {d.traktSource === 'list' && (
              <Field
                label="Trakt list"
                hint="Its address on trakt.tv, such as trakt.tv/users/sean/lists/blender."
                error={sourceError}
                className="medium:col-span-2"
              >
                <Input
                  value={d.list}
                  spellCheck={false}
                  autoCapitalize="none"
                  className="font-mono"
                  onChange={(e) => set({ list: e.target.value })}
                />
              </Field>
            )}
          </>
        )}
        {d.kind === 'generic' && (
          <Field
            label="Address"
            hint="An address that answers a JSON list of movies with their IMDb or TMDB ids, in the format Radarr calls StevenLu Custom. MDBList publishes IMDb and Letterboxd lists this way."
            error={err('url', missing.url)}
            className="medium:col-span-2"
          >
            <Input
              type="url"
              value={d.url}
              spellCheck={false}
              autoCapitalize="none"
              className="font-mono"
              onChange={(e) => set({ url: e.target.value })}
            />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-3 medium:col-span-2">
          <Button
            size="sm"
            icon="check"
            loading={test.pending}
            disabled={!sourceOk}
            onClick={onTest}
          >
            Test
          </Button>
          {tested && (
            <p
              role="status"
              className={tested.ok ? 'text-caption text-text-2' : 'text-badge-danger text-caption'}
            >
              {tested.message}
            </p>
          )}
        </div>
        <Field label="Name" error={err('name', missing.name)} className="medium:col-span-2">
          <Input
            value={d.rest.name}
            maxLength={100}
            onChange={(e) => setRest({ name: e.target.value })}
          />
        </Field>
        <Field
          label="Root folder"
          error={
            folders.length === 0
              ? `Add a ${adds === 'shows' ? 'Shows' : 'Movies'} folder in Media management first.`
              : err('rootFolder', missing.folder)
          }
          className="medium:col-span-2"
        >
          <Select
            value={d.rest.rootFolder || undefined}
            disabled={folders.length === 0}
            onValueChange={(rootFolder) => setRest({ rootFolder })}
            options={folders.map((f) => ({ value: f, label: f }))}
            className="font-mono"
          />
        </Field>
        <Field label="Quality profile" error={err('qualityProfileId', false)}>
          <Select
            value={d.rest.qualityProfileId || undefined}
            onValueChange={(qualityProfileId) => setRest({ qualityProfileId })}
            options={o.quality.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label="Subtitle languages">
          <Select
            value={d.rest.languageProfileId ?? 'none'}
            onValueChange={(v) => setRest({ languageProfileId: v === 'none' ? null : v })}
            options={[
              { value: 'none', label: 'The root folder’s default' },
              ...o.language.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Field>
        <Field
          label="Tags"
          hint={`Given to every ${noun} this list adds.`}
          className="medium:col-span-2"
        >
          <TagPicker value={d.rest.tags} onChange={(tags) => setRest({ tags })} />
        </Field>
        {adds === 'shows' ? (
          <Field
            label="Monitor"
            hint="Which episodes highsea looks for in each show it adds."
            className="medium:col-span-2"
          >
            <Select
              value={d.rest.monitor ?? 'all'}
              onValueChange={(v) => setRest({ monitor: v as ShowMonitor })}
              options={MONITOR.map(([value, label]) => ({ value, label }))}
            />
          </Field>
        ) : (
          <>
            <Field label="Minimum availability" className="medium:col-span-2">
              <Select
                value={d.rest.minimumAvailability}
                onValueChange={(v) => setRest({ minimumAvailability: v as MinimumAvailability })}
                options={AVAILABILITY.map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field
              inline
              label="Monitored"
              hint="highsea looks for the movies it adds."
              className="medium:col-span-2"
            >
              <Switch
                checked={d.rest.monitored}
                onCheckedChange={(monitored) => setRest({ monitored })}
              />
            </Field>
          </>
        )}
        <Field
          inline
          label="Search when added"
          hint={`Search every indexer for each new ${noun} at once.`}
          className="medium:col-span-2"
        >
          <Switch
            checked={d.rest.searchOnAdd}
            onCheckedChange={(searchOnAdd) => setRest({ searchOnAdd })}
          />
        </Field>
        <Field inline label="Check this list" className="medium:col-span-2">
          <Switch checked={d.rest.enabled} onCheckedChange={(enabled) => setRest({ enabled })} />
        </Field>
        {failure && !FORM_FIELDS.includes(failure.field ?? '') && (
          <p
            role="alert"
            className="rounded-md border border-line bg-s2 p-3 text-badge-danger text-caption medium:col-span-2"
          >
            {failure.message}
          </p>
        )}
        {/* lets Enter submit */}
        <button type="submit" hidden />
      </form>
    </DialogContent>
  )
}

// ---------------------------------------------------------------- Trakt

type Connecting = { code: TraktDeviceCode } | { ended: 'expired' | 'denied' } | null

function Trakt({ status }: { status: TraktStatus | undefined }) {
  const [connecting, setConnecting] = useState<Connecting>(null)
  const [confirm, setConfirm] = useState(false)
  const connect = useAction((c) => c.importLists.traktConnect())
  const disconnect = useAction((c) => c.importLists.traktDisconnect())
  const poll = useAction((c) => c.importLists.traktPoll())

  // poll at the interval Trakt asks for, until the code is used, refused or runs out
  const code = connecting && 'code' in connecting ? connecting.code : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: one loop per code
  useEffect(() => {
    if (!code) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const next = () => {
      timer = setTimeout(async () => {
        if (stopped) return
        try {
          const { state } = await poll.run()
          if (stopped) return
          if (state === 'pending') return next()
          if (state === 'connected') {
            setConnecting(null)
            toast.success('Trakt connected')
          } else setConnecting({ ended: state })
        } catch (e) {
          if (stopped) return
          setConnecting(null)
          toast.error('Couldn’t reach Trakt', { description: (e as Error).message })
        }
      }, code.interval * 1000)
    }
    next()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [code])

  const start = () =>
    connect.run().then(
      (c) => setConnecting({ code: c }),
      (e: Error) => toast.error('Couldn’t reach Trakt', { description: e.message }),
    )

  return (
    <Group
      title="Trakt account"
      description="For your watchlist and private lists. Public lists work without one."
    >
      {!status ? null : !status.available ? (
        <p className="text-caption text-text-3">
          This build of highsea has no Trakt application, so Trakt lists aren’t available.
        </p>
      ) : status.account ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="me-auto text-text-2 text-ui">Connected as {status.account}.</p>
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
            Disconnect
          </Button>
        </div>
      ) : code ? (
        <div className="grid gap-3">
          <p className="text-text-2 text-ui">
            Go to{' '}
            <a
              href={code.verificationUrl}
              target="_blank"
              rel="noreferrer"
              className="text-text underline underline-offset-2"
            >
              {code.verificationUrl.replace(/^https?:\/\//, '')}
            </a>{' '}
            and enter this code
          </p>
          <p className="justify-self-start rounded-md border border-line bg-s2 px-4 py-2 font-mono text-text text-title tracking-widest">
            <span className="sr-only">Your code: </span>
            {code.userCode}
          </p>
          <p role="status" className="text-caption text-text-3">
            Waiting for you to approve highsea on Trakt. The code works until{' '}
            {new Date(code.expiresAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start"
            onClick={() => setConnecting(null)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {connecting && 'ended' in connecting && (
            <p role="status" className="text-caption text-text-2">
              {connecting.ended === 'expired'
                ? 'The code ran out before it was entered. Connect again for a new one.'
                : 'The request was declined on Trakt.'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="me-auto text-caption text-text-3">No account connected.</p>
            <Button size="sm" loading={connect.pending} onClick={start}>
              Connect
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Disconnect ${status?.account ?? ''}?`}
        description="highsea forgets the account. Lists that need it stop being checked until you connect again."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() =>
          disconnect.run().then(
            () => toast({ title: 'Trakt disconnected' }),
            (e: Error) => toast.error('That didn’t work', { description: e.message }),
          )
        }
      />
    </Group>
  )
}

// ---------------------------------------------------------------- exclusions

function Exclusions() {
  const ago = useAgo()
  const exclusions = useQuery('import-lists:exclusions', (c) => c.importLists.exclusions(), [
    'settings.updated',
  ])
  const remove = useAction((c, tmdbId: number) => c.importLists.removeExclusion(tmdbId))
  const name = (e: ListExclusion) => (e.year ? `${e.title} (${e.year})` : e.title)
  return (
    <Group
      title="Exclusions"
      description="Movies you removed and asked lists not to add again. Remove one to let lists add it."
    >
      <Loadable query={exclusions} what="the exclusions">
        {(xs) =>
          xs.length === 0 ? (
            <p className="text-caption text-text-3">No exclusions.</p>
          ) : (
            <ul aria-label="Exclusions" className="grid gap-2">
              {xs.map((e) => (
                <li
                  key={e.tmdbId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-s2 p-3"
                >
                  <div className="me-auto grid min-w-0 gap-0.5">
                    <p className="text-text text-ui [overflow-wrap:anywhere]">{name(e)}</p>
                    <p className="text-caption text-text-3">Excluded {ago(e.createdAt)}</p>
                  </div>
                  <Button
                    size="sm"
                    aria-label={`Let lists add ${name(e)} again`}
                    onClick={() =>
                      remove.run(e.tmdbId).then(
                        () => toast({ title: `Lists can add ${name(e)} again` }),
                        (err: Error) =>
                          toast.error('That didn’t work', { description: err.message }),
                      )
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </Loadable>
    </Group>
  )
}
