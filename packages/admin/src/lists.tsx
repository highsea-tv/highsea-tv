'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Import lists (settings.md; checkpoint 8a, ADR 0045), ported from the prototype's
// ImportLists (design/prototypes/src/admin/settings/reference.tsx). Each list keeps the prototype's
// row (on, name, kind, titles, whether it searches, the quality profile), and real data adds the
// last check's result and Edit, Check now and Remove. Add a list is "Not in the prototype"; it is a
// dialog like A9's Edit (the plan's "What real data may force"), one form whose fields follow the
// kind. Trakt's account (its device flow) and the exclusions are groups below, also new.
// Changes save at once through `importLists.*`, as Download client's categories do. Drawn with the
// library's native renderer since D3 (one-client-platform-d.md), its rows in settings-card.tsx's cards.
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
} from '@highsea-tv/api-contract'
import type { T as Translate } from '@highsea-tv/i18n'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Switch,
  Text,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { useEffect, useState } from 'react'
import { Linking, Platform, View } from 'react-native'
import { lists as messages } from './lists-messages.ts'
import { Loadable } from './loadable.tsx'
import { AVAILABILITY } from './movie-data.ts'
import { AreaPage, Group } from './settings.tsx'
import { Card, Cards, Cell, FormGrid, Line, Note, WRAP_ANYWHERE } from './settings-card.tsx'
import { TagPicker } from './tag-picker.tsx'
import { tagsMessages } from './tags-messages.ts'
import { useRelative } from './time.ts'

type T = Translate<typeof messages>
type Kind = (typeof IMPORT_LIST_KINDS)[number]

const s = tokens.space
/** The Trakt code's tracking: Tailwind's `tracking-widest`, 0.1em of the title's 20. */
const CODE_TRACKING = 2
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
  tags: l.tags,
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
              <Cards label={t('title')}>
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
              </Cards>
            )
          }
        </Loadable>
        <Button icon="add" disabled={!options.data} onPress={() => setEditing('new')}>
          {t('add')}
        </Button>
      </Group>
      <Trakt status={trakt.data} reload={trakt.refetch} />
      <Exclusions />
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
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
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

/** The row's profile select, from medium widths: at most 14rem, or 40% of the row. */
const PROFILE_WIDTH = 224

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
  const medium = useWindowAtLeast(breakpoints.medium)
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
    <Card>
      <View
        style={{
          flexDirection: medium ? 'row' : 'column',
          alignItems: medium ? 'center' : 'stretch',
          gap: s['3'],
        }}
      >
        <View style={{ alignSelf: medium ? 'center' : 'flex-start' }}>
          <Switch
            label={t('enabled', { name: l.name })}
            hideLabel
            checked={l.enabled}
            disabled={update.pending}
            onCheckedChange={(enabled) => change({ enabled })}
          />
        </View>
        <View style={{ flex: medium ? 1 : undefined, minWidth: 0, gap: s['0.5'] }}>
          <Line style={WRAP_ANYWHERE}>{l.name}</Line>
          <Note>
            {kindLabel(t, l.settings)} · {t('items', { count: l.items })} ·{' '}
            {l.searchOnAdd ? t('searches') : t('noSearch')}
          </Note>
        </View>
        <View style={medium ? { width: PROFILE_WIDTH, maxWidth: '40%' } : undefined}>
          <Select
            aria-label={t('profile', { name: l.name })}
            value={l.qualityProfileId}
            disabled={update.pending}
            onValueChange={(qualityProfileId) => change({ qualityProfileId })}
            options={profiles.map((p) => ({ value: p.id, label: p.name }))}
          />
        </View>
      </View>
      <View style={{ gap: s['1'] }}>
        <Note>
          {l.lastSync ? t('checked', { ago: relative(l.lastSync) }) : t('never')}
          {r && !r.error
            ? ` · ${t('result', { found: r.found, added: r.added, skipped: r.skipped })}`
            : null}
        </Note>
        {r?.error && (
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}
          >
            <Badge tone="warning">{t('failed', { message: r.error })}</Badge>
          </View>
        )}
        {r && r.unresolved.length > 0 && (
          <Note style={WRAP_ANYWHERE}>{t('unresolved', { titles: r.unresolved.join(', ') })}</Note>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
        <Button
          size="sm"
          icon="edit"
          accessibilityLabel={t('editLabel', { name: l.name })}
          onPress={onEdit}
        >
          {t('edit')}
        </Button>
        <Button
          size="sm"
          icon="refresh"
          loading={sync.pending}
          accessibilityLabel={t('syncLabel', { name: l.name })}
          onPress={() =>
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
          accessibilityLabel={t('removeLabel', { name: l.name })}
          onPress={onRemove}
        >
          {t('remove')}
        </Button>
      </View>
    </Card>
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
  const tt = useT(tagsMessages)
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

  /** Enter in a field saves, as the web's form submitted. */
  const typed = { onSubmitEditing: submit, autoComplete: 'off', autoCorrect: false } as const
  const code = { ...typed, spellCheck: false, autoCapitalize: 'none', mono: true } as const

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={list ? t('form.editTitle', { name: list.name }) : t('form.addTitle')}
      description={t('form.description')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" loading={save.pending} disabled={blocked} onPress={submit}>
            {t('form.save')}
          </Button>
        </>
      }
    >
      <FormGrid>
        <Cell>
          <Field label={t('form.kind')}>
            <SegmentedControl
              aria-label={t('form.kind')}
              value={d.kind}
              onValueChange={(kind) => set({ kind: kind as Kind })}
              options={IMPORT_LIST_KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
            />
          </Field>
        </Cell>
        {d.kind === 'tmdb' && (
          <>
            <Cell>
              <Field
                label={t('form.source')}
                hint={d.tmdbSource === 'list' ? undefined : t('form.tmdbChartHint')}
              >
                <Select
                  value={d.tmdbSource}
                  onValueChange={(v) => set({ tmdbSource: v as Draft['tmdbSource'] })}
                  options={TMDB_LIST_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))}
                />
              </Field>
            </Cell>
            {d.tmdbSource === 'list' && (
              <Cell>
                <Field label={t('form.tmdbList')} hint={t('form.tmdbListHint')} error={sourceError}>
                  <Input value={d.list} onChangeText={(list) => set({ list })} {...code} />
                </Field>
              </Cell>
            )}
          </>
        )}
        {d.kind === 'trakt' && (
          <>
            <Cell>
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
              >
                <Select
                  value={d.traktSource}
                  onValueChange={(v) => set({ traktSource: v as Draft['traktSource'] })}
                  options={TRAKT_LIST_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))}
                />
              </Field>
            </Cell>
            {d.traktSource === 'list' && (
              <Cell>
                <Field
                  label={t('form.traktList')}
                  hint={t('form.traktListHint')}
                  error={sourceError}
                >
                  <Input value={d.list} onChangeText={(list) => set({ list })} {...code} />
                </Field>
              </Cell>
            )}
          </>
        )}
        {d.kind === 'generic' && (
          <Cell>
            <Field label={t('form.url')} hint={t('form.urlHint')} error={err('url', missing.url)}>
              <Input
                inputMode="url"
                keyboardType="url"
                value={d.url}
                onChangeText={(url) => set({ url })}
                {...code}
              />
            </Field>
          </Cell>
        )}
        <Cell>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['3'] }}
          >
            <Button
              size="sm"
              icon="check"
              loading={test.pending}
              disabled={!sourceOk}
              onPress={onTest}
            >
              {t('form.test')}
            </Button>
            {tested && (
              <Note role="status" color={tested.ok ? 'text-2' : 'danger'}>
                {tested.message}
              </Note>
            )}
          </View>
        </Cell>
        <Cell>
          <Field label={t('form.name')} error={err('name', missing.name)}>
            <Input
              value={d.rest.name}
              maxLength={100}
              onChangeText={(name) => setRest({ name })}
              {...typed}
            />
          </Field>
        </Cell>
        <Cell>
          <Field
            label={t('form.rootFolder')}
            error={
              o.folders.length === 0
                ? t('form.noFolders')
                : (err('rootFolder', missing.folder) ?? undefined)
            }
          >
            <Select
              value={d.rest.rootFolder || undefined}
              disabled={o.folders.length === 0}
              onValueChange={(rootFolder) => setRest({ rootFolder })}
              options={o.folders.map((f) => ({ value: f, label: f, mono: true }))}
            />
          </Field>
        </Cell>
        <Cell half>
          <Field label={t('form.qualityProfile')} error={err('qualityProfileId', false)}>
            <Select
              value={d.rest.qualityProfileId || undefined}
              onValueChange={(qualityProfileId) => setRest({ qualityProfileId })}
              options={o.quality.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
        </Cell>
        <Cell half>
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
        </Cell>
        <Cell>
          <Field label={tt('label')} hint={tt('hint.list')}>
            <TagPicker value={d.rest.tags ?? []} onChange={(tags) => setRest({ tags })} />
          </Field>
        </Cell>
        <Cell>
          <Field label={t('form.availability')}>
            <Select
              value={d.rest.minimumAvailability}
              onValueChange={(v) => setRest({ minimumAvailability: v as MinimumAvailability })}
              options={AVAILABILITY.map((value) => ({
                value,
                label: t(`availability.${value}`),
              }))}
            />
          </Field>
        </Cell>
        <Cell>
          <Switch
            label={t('form.monitored')}
            hint={t('form.monitoredHint')}
            checked={d.rest.monitored}
            onCheckedChange={(monitored) => setRest({ monitored })}
          />
        </Cell>
        <Cell>
          <Switch
            label={t('form.searchOnAdd')}
            hint={t('form.searchOnAddHint')}
            checked={d.rest.searchOnAdd}
            onCheckedChange={(searchOnAdd) => setRest({ searchOnAdd })}
          />
        </Cell>
        <Cell>
          <Switch
            label={t('form.enabled')}
            checked={d.rest.enabled}
            onCheckedChange={(enabled) => setRest({ enabled })}
          />
        </Cell>
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
            <Cell>
              <Card role="alert">
                <Note color="danger">{failure.message}</Note>
              </Card>
            </Cell>
          )}
      </FormGrid>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Trakt

type Connecting = { code: TraktDeviceCode } | { ended: 'expired' | 'denied' } | null

function Trakt({ status, reload }: { status: TraktStatus | undefined; reload: () => void }) {
  const t = useT(messages)
  const { colors } = useTheme()
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
        <Note>{t('trakt.unavailable')}</Note>
      ) : status.account ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['3'] }}>
          <Line color="text-2" style={{ marginEnd: 'auto' }}>
            {t('trakt.connected', { account: status.account })}
          </Line>
          <Button size="sm" variant="danger" onPress={() => setConfirm(true)}>
            {t('trakt.disconnect')}
          </Button>
        </View>
      ) : code ? (
        <View style={{ gap: s['3'], alignItems: 'flex-start' }}>
          <Line color="text-2">
            <TraktCodeLine t={t} url={code.verificationUrl} />
          </Line>
          <View
            aria-label={`${t('trakt.codeLabel')}: ${code.userCode}`}
            style={{
              paddingHorizontal: s['4'],
              paddingVertical: s['2'],
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: tokens.radius.md,
              backgroundColor: colors.s2,
            }}
          >
            <Text
              mono
              variant="title"
              color="text"
              aria-hidden
              style={{ letterSpacing: CODE_TRACKING }}
            >
              {code.userCode}
            </Text>
          </View>
          <Note role="status">
            {t('trakt.waiting')}{' '}
            {t('trakt.expires', {
              at: new Date(code.expiresAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </Note>
          <Button size="sm" variant="ghost" onPress={() => setConnecting(null)}>
            {t('trakt.cancel')}
          </Button>
        </View>
      ) : (
        <View style={{ gap: s['3'] }}>
          {connecting && 'ended' in connecting && (
            <Note role="status" color="text-2">
              {t(connecting.ended === 'expired' ? 'trakt.expired' : 'trakt.denied')}
            </Note>
          )}
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['3'] }}
          >
            <Note style={{ marginEnd: 'auto' }}>{t('trakt.none')}</Note>
            <Button size="sm" loading={connect.pending} onPress={start}>
              {t('trakt.connect')}
            </Button>
          </View>
        </View>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
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

/**
 * "Go to trakt.tv/activate and enter this code", with the address as a link inside the sentence:
 * a nested Text with react-native-web's `href` and `hrefAttrs`, which it draws as an `<a>`
 * (https://necolas.github.io/react-native-web/docs/text/), opening in a new tab as before.
 */
function TraktCodeLine({ t, url }: { t: T; url: string }) {
  const [before, after] = t('trakt.code', { url: '\u0000' }).split('\u0000')
  const ui = tokens.adminText.ui
  return (
    <>
      {before}
      <Text
        size={ui.size}
        leading={ui.leading}
        color="text"
        role="link"
        style={{ textDecorationLine: 'underline' }}
        onPress={Platform.OS === 'web' ? undefined : () => Linking.openURL(url)}
        {...({ href: url, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as object)}
      >
        {url.replace(/^https?:\/\//, '')}
      </Text>
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
            <Note>{t('exclusions.none')}</Note>
          ) : (
            <Cards label={t('exclusions.title')}>
              {xs.map((e) => (
                <Card
                  key={e.tmdbId}
                  style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <View style={{ marginEnd: 'auto', minWidth: 0, flexShrink: 1, gap: s['0.5'] }}>
                    <Line style={WRAP_ANYWHERE}>{name(e)}</Line>
                    <Note>{t('exclusions.added', { ago: relative(e.createdAt) })}</Note>
                  </View>
                  <Button
                    size="sm"
                    accessibilityLabel={t('exclusions.removeLabel', { title: name(e) })}
                    onPress={() =>
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
                </Card>
              ))}
            </Cards>
          )
        }
      </Loadable>
    </Group>
  )
}
