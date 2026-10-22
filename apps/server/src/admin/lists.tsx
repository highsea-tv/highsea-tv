'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Import lists (settings.md; checkpoint 8a, ADR 0045), ported from the prototype's
// ImportLists (design/prototypes/src/admin/settings/reference.tsx). Each list keeps the prototype's
// row (on, name, kind, titles, whether it searches, the quality profile), and real data adds the
// last check's result and Edit, Check now and Remove. Add a list is "Not in the prototype"; it is a
// dialog like A9's Edit (the plan's "What real data may force"), one form whose fields follow the
// kind. Trakt's account (its device flow) and the exclusions are groups below, also new.
// Changes save at once through `importLists.*`, as Download client's categories do.
import {
  IMPORT_LIST_KINDS,
  type ImportList,
  type ImportListInput,
  type ImportListSettings,
  type ImportListTest,
  LIST_TOPICS,
  type ListExclusion,
  type MinimumAvailability,
  TMDB_LIST_SOURCES,
  TRAKT_LIST_SOURCES,
  type TraktDeviceCode,
  type TraktStatus,
} from '@highsea/api-contract'
import type { T as Translate } from '@highsea/i18n'
import { useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
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
} from '@highsea/ui-web'
import { useEffect, useState } from 'react'
import { lists as messages } from './lists-messages.ts'
import { Loadable } from './loadable.tsx'
import { AVAILABILITY } from './movie-data.ts'
import { AreaPage, Group } from './settings.tsx'
import { useRelative } from './time.ts'

type T = Translate<typeof messages>
type Kind = (typeof IMPORT_LIST_KINDS)[number]

const TOPICS = [LIST_TOPICS.lists]
const OPTION_TOPICS = ['settings.updated', 'subtitles.updated']

/** What the form needs to offer: folders, both kinds of profile, and Trakt's state. */
type Options = {
  folders: string[]
  quality: { id: string; name: string }[]
  language: { id: string; name: string }[]
}

function useOptions() {
  return useQuery(
    'import-lists:options',
    async (c): Promise<Options> => {
      const [folders, quality, language] = await Promise.all([
        c.rootFolders.list(),
        c.quality.profiles(),
        c.subtitles.languageProfiles(),
      ])
      return {
        folders: folders.map((f) => f.path),
        quality: quality.map((p) => ({ id: p.id, name: p.name })),
        language: language.map((p) => ({ id: p.id, name: p.name })),
      }
    },
    OPTION_TOPICS,
  )
}

/** The list's input, from a saved list: what Edit and the row's quick changes send back. */
const inputOf = (l: ImportList): ImportListInput => ({
  name: l.name,
  enabled: l.enabled,
  settings: l.settings,
  rootFolder: l.rootFolder,
  qualityProfileId: l.qualityProfileId,
  languageProfileId: l.languageProfileId,
  monitored: l.monitored,
  minimumAvailability: l.minimumAvailability,
  searchOnAdd: l.searchOnAdd,
})

/** "Trakt · Your watchlist", "TMDB · Popular", "Generic list". */
function kindLabel(t: T, s: ImportListSettings) {
  if (s.kind === 'generic') return t('kind.generic')
  return `${t(`kind.${s.kind}`)} · ${t(`source.${s.source}`)}`
}

export function ImportLists() {
  const t = useT(messages)
  const lists = useQuery('import-lists', (c) => c.importLists.list(), TOPICS)
  const trakt = useQuery('import-lists:trakt', (c) => c.importLists.trakt(), TOPICS)
  const options = useOptions()
  // null: closed; 'new': Add a list; a list: Edit
  const [editing, setEditing] = useState<ImportList | 'new' | null>(null)
  const [removing, setRemoving] = useState<ImportList | null>(null)
  const remove = useAction((c, id: string) => c.importLists.remove({ params: { id } }))

  return (
    <AreaPage id="lists">
      <Group title={t('title')} description={t('description')}>
        <Loadable query={lists} what={t('what')}>
          {(ls) =>
            ls.length === 0 ? (
              <EmptyState icon="bookmark" title={t('none')}>
                {t('noneBody')}
              </EmptyState>
            ) : (
              <ul aria-label={t('title')} className="grid gap-2">
                {ls.map((l) => (
                  <Row
                    key={l.id}
                    list={l}
                    profiles={options.data?.quality ?? []}
                    onEdit={() => setEditing(l)}
                    onRemove={() => setRemoving(l)}
                    onChanged={lists.refetch}
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
          {t('add')}
        </Button>
      </Group>
      <Trakt status={trakt.data} reload={trakt.refetch} />
      <Exclusions />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing !== null && options.data && (
          <ListForm
            key={editing === 'new' ? 'new' : editing.id}
            list={editing === 'new' ? null : editing}
            options={options.data}
            trakt={trakt.data}
            onClose={() => setEditing(null)}
            onSaved={lists.refetch}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('removeTitle', { name: removing?.name ?? '' })}
        description={t('removeBody')}
        confirmLabel={t('removeConfirm')}
        cancelLabel={t('keep')}
        destructive
        onConfirm={() => {
          const l = removing
          if (l)
            remove.run(l.id).then(
              () => {
                toast({ title: t('removed', { name: l.name }) })
                lists.refetch()
              },
              (e: Error) => toast.error(t('actionFailed'), { description: e.message }),
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
  onChanged,
}: {
  list: ImportList
  profiles: Options['quality']
  onEdit: () => void
  onRemove: () => void
  onChanged: () => void
}) {
  const t = useT(messages)
  const { relative } = useRelative()
  const update = useAction((c, body: ImportListInput) =>
    c.importLists.update({ params: { id: l.id }, body }),
  )
  const sync = useAction((c) => c.importLists.sync({ params: { id: l.id } }))
  const change = (patch: Partial<ImportListInput>) =>
    update
      .run({ ...inputOf(l), ...patch })
      .then(onChanged, (e: Error) => toast.error(t('saveFailed'), { description: e.message }))
  const r = l.lastResult
  return (
    <li className="grid gap-3 rounded-md border border-line bg-s2 p-3">
      <div className="grid gap-3 medium:grid-cols-[auto_minmax(0,1fr)_14rem] medium:items-center">
        <Switch
          aria-label={t('enabled', { name: l.name })}
          checked={l.enabled}
          disabled={update.pending}
          onCheckedChange={(enabled) => change({ enabled })}
        />
        <div className="grid min-w-0 gap-0.5">
          <p className="text-text text-ui [overflow-wrap:anywhere]">{l.name}</p>
          <p className="text-caption text-text-3">
            {kindLabel(t, l.settings)} · {t('items', { count: l.items })} ·{' '}
            {l.searchOnAdd ? t('searches') : t('noSearch')}
          </p>
        </div>
        <Select
          aria-label={t('profile', { name: l.name })}
          value={l.qualityProfileId}
          disabled={update.pending}
          onValueChange={(qualityProfileId) => change({ qualityProfileId })}
          options={profiles.map((p) => ({ value: p.id, label: p.name }))}
        />
      </div>
      <div className="grid gap-1 text-caption text-text-3">
        <p>
          {l.lastSync ? t('checked', { ago: relative(l.lastSync) }) : t('never')}
          {r && !r.error && (
            <>
              {' · '}
              {t('result', { found: r.found, added: r.added, skipped: r.skipped })}
            </>
          )}
        </p>
        {r?.error && (
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">{t('failed', { message: r.error })}</Badge>
          </p>
        )}
        {r && r.unresolved.length > 0 && (
          <p className="[overflow-wrap:anywhere]">
            {t('unresolved', { titles: r.unresolved.join(', ') })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon="edit"
          aria-label={t('editLabel', { name: l.name })}
          onClick={onEdit}
        >
          {t('edit')}
        </Button>
        <Button
          size="sm"
          icon="refresh"
          loading={sync.pending}
          aria-label={t('syncLabel', { name: l.name })}
          onClick={() =>
            sync.run().then(
              () => toast({ title: t('syncing', { name: l.name }), description: t('syncingBody') }),
              (e: Error) => toast.error(t('actionFailed'), { description: e.message }),
            )
          }
        >
          {t('sync')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          aria-label={t('removeLabel', { name: l.name })}
          onClick={onRemove}
        >
          {t('remove')}
        </Button>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------- Add a list, Edit

type Draft = {
  kind: Kind
  tmdbSource: (typeof TMDB_LIST_SOURCES)[number]
  traktSource: (typeof TRAKT_LIST_SOURCES)[number]
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
          name: '',
          enabled: true,
          rootFolder: o.folders[0] ?? '',
          qualityProfileId: (o.quality.find((p) => p.id === 'qp-hd') ?? o.quality[0])?.id ?? '',
          languageProfileId: null,
          monitored: true,
          minimumAvailability: 'released',
          searchOnAdd: false,
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

/** The field a refused save names (`details.field`). */
function fieldOf(error: unknown): string | undefined {
  const details = (error as { details?: unknown } | null)?.details
  const field = (details as { field?: unknown } | undefined)?.field
  return typeof field === 'string' ? field : undefined
}

function ListForm({
  list,
  options: o,
  trakt,
  onClose,
  onSaved,
}: {
  list: ImportList | null
  options: Options
  trakt: TraktStatus | undefined
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT(messages)
  const [d, setD] = useState(() => draftOf(list, o))
  const [touched, setTouched] = useState(false)
  const [failure, setFailure] = useState<{ field?: string; message: string } | null>(null)
  const [tested, setTested] = useState<ImportListTest | null>(null)
  const save = useAction((c, body: ImportListInput) =>
    list ? c.importLists.update({ params: { id: list.id }, body }) : c.importLists.add({ body }),
  )
  const test = useAction((c, settings: ImportListSettings) =>
    c.importLists.test({ body: { settings } }),
  )
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
      const saved = await save.run({ ...d.rest, name: d.rest.name.trim(), settings: settingsOf(d) })
      onClose()
      onSaved()
      if (list) toast.success(t('form.saved', { name: saved.name }))
      else
        toast.success(t('form.added', { name: saved.name }), { description: t('form.addedBody') })
    } catch (e) {
      setFailure({ field: fieldOf(e), message: (e as Error).message })
    }
  }

  const onTest = () =>
    test
      .run(settingsOf(d))
      .then(setTested, (e: Error) => setTested({ ok: false, message: e.message, found: 0 }))

  const err = (field: string, isMissing: boolean) =>
    failure?.field === field
      ? failure.message
      : touched && isMissing
        ? t('form.required')
        : undefined
  const sourceError =
    err('list', missing.list) ?? (failure?.field === 'settings' ? failure.message : undefined)

  return (
    <DialogContent
      size="md"
      title={list ? t('form.editTitle', { name: list.name }) : t('form.addTitle')}
      description={t('form.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" loading={save.pending} disabled={blocked} onClick={submit}>
            {t('form.save')}
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
        <Field label={t('form.kind')} className="medium:col-span-2">
          <SegmentedControl
            aria-label={t('form.kind')}
            value={d.kind}
            onValueChange={(kind) => set({ kind: kind as Kind })}
            options={IMPORT_LIST_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          />
        </Field>
        {d.kind === 'tmdb' && (
          <>
            <Field
              label={t('form.source')}
              hint={d.tmdbSource === 'list' ? undefined : t('form.tmdbChartHint')}
              className="medium:col-span-2"
            >
              <Select
                value={d.tmdbSource}
                onValueChange={(v) => set({ tmdbSource: v as Draft['tmdbSource'] })}
                options={TMDB_LIST_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))}
              />
            </Field>
            {d.tmdbSource === 'list' && (
              <Field
                label={t('form.tmdbList')}
                hint={t('form.tmdbListHint')}
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
              label={t('form.source')}
              hint={
                traktOff
                  ? undefined
                  : d.traktSource === 'watchlist'
                    ? t('form.traktWatchlist')
                    : d.traktSource === 'list'
                      ? undefined
                      : t('form.traktChartHint')
              }
              error={
                traktOff
                  ? t('form.traktUnavailable')
                  : needsAccount
                    ? t('form.traktNeedsAccount')
                    : undefined
              }
              className="medium:col-span-2"
            >
              <Select
                value={d.traktSource}
                onValueChange={(v) => set({ traktSource: v as Draft['traktSource'] })}
                options={TRAKT_LIST_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))}
              />
            </Field>
            {d.traktSource === 'list' && (
              <Field
                label={t('form.traktList')}
                hint={t('form.traktListHint')}
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
            label={t('form.url')}
            hint={t('form.urlHint')}
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
            {t('form.test')}
          </Button>
          {tested && (
            <p
              role="status"
              className={tested.ok ? 'text-caption text-text-2' : 'text-caption text-danger'}
            >
              {tested.ok
                ? t('form.testOk', { message: tested.message, count: tested.found })
                : tested.message}
            </p>
          )}
        </div>
        <Field
          label={t('form.name')}
          error={err('name', missing.name)}
          className="medium:col-span-2"
        >
          <Input
            value={d.rest.name}
            maxLength={100}
            onChange={(e) => setRest({ name: e.target.value })}
          />
        </Field>
        <Field
          label={t('form.rootFolder')}
          error={
            o.folders.length === 0
              ? t('form.noFolders')
              : (err('rootFolder', missing.folder) ?? undefined)
          }
          className="medium:col-span-2"
        >
          <Select
            value={d.rest.rootFolder || undefined}
            disabled={o.folders.length === 0}
            onValueChange={(rootFolder) => setRest({ rootFolder })}
            options={o.folders.map((f) => ({ value: f, label: f }))}
            className="font-mono"
          />
        </Field>
        <Field label={t('form.qualityProfile')} error={err('qualityProfileId', false)}>
          <Select
            value={d.rest.qualityProfileId || undefined}
            onValueChange={(qualityProfileId) => setRest({ qualityProfileId })}
            options={o.quality.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label={t('form.languageProfile')} error={err('languageProfileId', false)}>
          <Select
            value={d.rest.languageProfileId ?? 'none'}
            onValueChange={(v) => setRest({ languageProfileId: v === 'none' ? null : v })}
            options={[
              { value: 'none', label: t('form.languageNone') },
              ...o.language.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Field>
        <Field label={t('form.availability')} className="medium:col-span-2">
          <Select
            value={d.rest.minimumAvailability}
            onValueChange={(v) => setRest({ minimumAvailability: v as MinimumAvailability })}
            options={AVAILABILITY.map((value) => ({
              value,
              label: t(`availability.${value}`),
            }))}
          />
        </Field>
        <Field
          inline
          label={t('form.monitored')}
          hint={t('form.monitoredHint')}
          className="medium:col-span-2"
        >
          <Switch
            checked={d.rest.monitored}
            onCheckedChange={(monitored) => setRest({ monitored })}
          />
        </Field>
        <Field
          inline
          label={t('form.searchOnAdd')}
          hint={t('form.searchOnAddHint')}
          className="medium:col-span-2"
        >
          <Switch
            checked={d.rest.searchOnAdd}
            onCheckedChange={(searchOnAdd) => setRest({ searchOnAdd })}
          />
        </Field>
        <Field inline label={t('form.enabled')} className="medium:col-span-2">
          <Switch checked={d.rest.enabled} onCheckedChange={(enabled) => setRest({ enabled })} />
        </Field>
        {failure &&
          ![
            'name',
            'url',
            'list',
            'settings',
            'rootFolder',
            'qualityProfileId',
            'languageProfileId',
          ].includes(failure.field ?? '') && (
            <p
              role="alert"
              className="rounded-md border border-line bg-s2 p-3 text-caption text-danger medium:col-span-2"
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

function Trakt({ status, reload }: { status: TraktStatus | undefined; reload: () => void }) {
  const t = useT(messages)
  const [connecting, setConnecting] = useState<Connecting>(null)
  const [confirm, setConfirm] = useState(false)
  const connect = useAction((c) => c.importLists.traktConnect())
  const disconnect = useAction((c) => c.importLists.traktDisconnect())
  const poll = useAction((c) => c.importLists.traktPoll())

  // poll at the interval Trakt asks for, until the code is used, refused or runs out; stops when
  // the page goes away or Cancel is pressed
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
            toast.success(t('trakt.connectedToast'))
            reload()
          } else setConnecting({ ended: state })
        } catch (e) {
          if (stopped) return
          setConnecting(null)
          toast.error(t('trakt.failed'), { description: (e as Error).message })
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
      (e: Error) => toast.error(t('trakt.failed'), { description: e.message }),
    )

  return (
    <Group title={t('trakt.title')} description={t('trakt.description')}>
      {!status ? null : !status.available ? (
        <p className="text-caption text-text-3">{t('trakt.unavailable')}</p>
      ) : status.account ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="me-auto text-text-2 text-ui">
            {t('trakt.connected', { account: status.account })}
          </p>
          <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
            {t('trakt.disconnect')}
          </Button>
        </div>
      ) : code ? (
        <div className="grid gap-3">
          <p className="text-text-2 text-ui">
            <TraktCodeLine t={t} url={code.verificationUrl} />
          </p>
          <p className="justify-self-start rounded-md border border-line bg-s2 px-4 py-2 font-mono text-text text-title tracking-widest">
            <span className="sr-only">{t('trakt.codeLabel')}: </span>
            {code.userCode}
          </p>
          <p role="status" className="text-caption text-text-3">
            {t('trakt.waiting')}{' '}
            {t('trakt.expires', {
              at: new Date(code.expiresAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start"
            onClick={() => setConnecting(null)}
          >
            {t('trakt.cancel')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {connecting && 'ended' in connecting && (
            <p role="status" className="text-caption text-text-2">
              {t(connecting.ended === 'expired' ? 'trakt.expired' : 'trakt.denied')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="me-auto text-caption text-text-3">{t('trakt.none')}</p>
            <Button size="sm" loading={connect.pending} onClick={start}>
              {t('trakt.connect')}
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('trakt.disconnectTitle', { account: status?.account ?? '' })}
        description={t('trakt.disconnectBody')}
        confirmLabel={t('trakt.disconnect')}
        destructive
        onConfirm={() =>
          disconnect.run().then(
            () => {
              toast({ title: t('trakt.disconnected') })
              reload()
            },
            (e: Error) => toast.error(t('actionFailed'), { description: e.message }),
          )
        }
      />
    </Group>
  )
}

/** "Go to trakt.tv/activate and enter this code", with the address as a link. */
function TraktCodeLine({ t, url }: { t: T; url: string }) {
  const [before, after] = t('trakt.code', { url: '\u0000' }).split('\u0000')
  return (
    <>
      {before}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-text underline underline-offset-2"
      >
        {url.replace(/^https?:\/\//, '')}
      </a>
      {after}
    </>
  )
}

// ---------------------------------------------------------------- exclusions

function Exclusions() {
  const t = useT(messages)
  const { relative } = useRelative()
  const exclusions = useQuery('import-lists:exclusions', (c) => c.importLists.exclusions(), TOPICS)
  const remove = useAction((c, tmdbId: number) =>
    c.importLists.removeExclusion({ params: { tmdbId } }),
  )
  const name = (e: ListExclusion) =>
    e.year ? t('exclusions.year', { title: e.title, year: String(e.year) }) : e.title
  return (
    <Group title={t('exclusions.title')} description={t('exclusions.description')}>
      <Loadable query={exclusions} what={t('exclusions.what')}>
        {(xs) =>
          xs.length === 0 ? (
            <p className="text-caption text-text-3">{t('exclusions.none')}</p>
          ) : (
            <ul aria-label={t('exclusions.title')} className="grid gap-2">
              {xs.map((e) => (
                <li
                  key={e.tmdbId}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-s2 p-3"
                >
                  <div className="me-auto grid min-w-0 gap-0.5">
                    <p className="text-text text-ui [overflow-wrap:anywhere]">{name(e)}</p>
                    <p className="text-caption text-text-3">
                      {t('exclusions.added', { ago: relative(e.createdAt) })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    aria-label={t('exclusions.removeLabel', { title: name(e) })}
                    onClick={() =>
                      remove.run(e.tmdbId).then(
                        () => {
                          toast({ title: t('exclusions.removed', { title: name(e) }) })
                          exclusions.refetch()
                        },
                        (err: Error) =>
                          toast.error(t('actionFailed'), { description: err.message }),
                      )
                    }
                  >
                    {t('exclusions.remove')}
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
