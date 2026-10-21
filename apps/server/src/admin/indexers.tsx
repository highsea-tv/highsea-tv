'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A9 Indexers (indexers.md), ported from the prototype with real data. Installed indexers with
// health, backoff and 24-hour stats; the catalog to add more. Public indexers that need nothing
// filled in are one click: the server tests before it adds. The others open a form generated from
// the definition, with "where to find this" under each field, tested before saving. What real data
// changes from the prototype:
// - the catalog's version and changelog come from the server, with an update waiting when updates
//   ask first (owner's answer 4);
// - a public definition with a required field and no default (generic Torznab's address and key)
//   opens Set up, since one click can't fill it in;
// - Edit in More opens the same form with the name and priority (owner's answer 5); a secret shows
//   empty and keeps the saved one unless something is typed;
// - Edit also has the seeding rule (checkpoint 6a; checkpoint 5's answer 5): a ratio, a time and a
//   minimum seed time for hit-and-run rules, in hours; an empty field uses Download client's;
// - Local badges, a line for indexers that need attention, and a dash for stats with no queries.
import type {
  CatalogIndexer,
  CatalogStatus,
  Indexer,
  IndexerTestResult,
  SettingField,
} from '@highsea/api-contract'
import { percent } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  type BadgeTone,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SegmentedControl,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
  toast,
} from '@highsea/ui-web'
import { useState } from 'react'
import { hoursText, minutesOf, ratioOf, ratioText } from './download-client-seeding.ts'
import { indexers as messages } from './indexers-messages.ts'
import { Loadable } from './loadable.tsx'
import { AdminPage } from './shell.tsx'
import { useRelative } from './time.ts'

type Health = Indexer['health']
type Privacy = CatalogIndexer['privacy']

/** The prototype's status.ts entry for indexer health. */
const healthTone: Record<Health, BadgeTone> = {
  healthy: 'success',
  backoff: 'warning',
  failing: 'danger',
  disabled: 'neutral',
}

const privacyTone: Record<Privacy, BadgeTone> = {
  public: 'success',
  'semi-private': 'info',
  private: 'warning',
}

const LIVE = ['indexers.updated', 'health.updated', 'catalog.updated']

type Tab = 'installed' | 'catalog'

/** "English" for `en`, in the admin's language. */
function useLanguageName() {
  const t = useT(messages)
  const locale = useLocale()
  return (code: string) => {
    if (code === 'multi') return t('language.multi')
    try {
      return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
    } catch {
      return code
    }
  }
}

/** One click only when the definition is public and every required field has a default. */
export const isOneClick = (d: CatalogIndexer) =>
  d.privacy === 'public' && d.settings.every((f) => !f.required || f.default !== undefined)

export function Indexers() {
  const t = useT(messages)
  const [tab, setTab] = useState<Tab>('installed')
  const installed = useQuery('indexers', (c) => c.indexers.list(), LIVE)
  const status = useQuery('catalog:status', (c) => c.catalog.status(), ['catalog.updated'])
  const [notes, setNotes] = useState(false)

  return (
    <AdminPage
      title={t('title')}
      description={
        status.data ? (
          <>
            {status.data.version ? (
              <Mono
                text={t('catalogLine', { version: status.data.version })}
                value={status.data.version}
              />
            ) : (
              t('noCatalog')
            )}{' '}
            <button type="button" onClick={() => setNotes(true)} className="underline">
              {t('whatChanged')}
            </button>
          </>
        ) : undefined
      }
      actions={
        <Button variant="primary" icon="add" onClick={() => setTab('catalog')}>
          {t('add')}
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label={t('sections')}>
          <TabsTrigger value="installed" count={installed.data?.length || undefined}>
            {t('tab.installed')}
          </TabsTrigger>
          <TabsTrigger value="catalog">{t('tab.catalog')}</TabsTrigger>
        </TabsList>
        <TabsContent value="installed" className="pt-5">
          <Installed onBrowse={() => setTab('catalog')} />
        </TabsContent>
        <TabsContent value="catalog" className="pt-5">
          <Catalog />
        </TabsContent>
      </Tabs>
      {status.data && <WhatChanged status={status.data} open={notes} onOpenChange={setNotes} />}
    </AdminPage>
  )
}

/** `text` with `value` set in mono, as the prototype sets the catalog's version. */
function Mono({ text, value }: { text: string; value: string }) {
  const at = text.indexOf(value)
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span className="font-mono">{value}</span>
      {text.slice(at + value.length)}
    </>
  )
}

// ---------------------------------------------------------------- what changed

function WhatChanged({
  status,
  open,
  onOpenChange,
}: {
  status: CatalogStatus
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const t = useT(messages)
  const install = useAction((c) => c.catalog.install())
  const available = status.available
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('changes.title')} size="md">
        <div className="grid gap-4">
          {available && (
            <div className="grid gap-2 rounded-md border border-line bg-s2 p-3">
              <p className="text-body text-text">
                {t('changes.available', { version: available.version })}
              </p>
              <ChangeList changes={available.changes} />
              <Button
                size="sm"
                variant="primary"
                loading={install.pending}
                className="justify-self-start"
                onClick={() =>
                  install.run().then(
                    (s) => toast.success(t('changes.installed', { version: s.version ?? '' })),
                    (e: Error) =>
                      toast.error(t('changes.installFailed'), { description: e.message }),
                  )
                }
              >
                {t('changes.install', { version: available.version })}
              </Button>
            </div>
          )}
          {status.changes.length === 0 && !available ? (
            <p className="text-body text-text-2">{t('changes.none')}</p>
          ) : (
            <ChangeList changes={status.changes} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ChangeList({ changes }: { changes: CatalogStatus['changes'] }) {
  return (
    <ol className="grid gap-4">
      {changes.map((c) => (
        <li key={c.version} className="grid gap-1">
          <h3 className="font-mono font-semibold text-text text-ui">{c.version}</h3>
          <ul className="grid list-disc gap-0.5 ps-5 text-body text-text-2">
            {c.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------- installed

function Installed({ onBrowse }: { onBrowse: () => void }) {
  const t = useT(messages)
  const { relative } = useRelative()
  const list = useQuery('indexers', (c) => c.indexers.list(), LIVE)
  const catalog = useQuery('catalog:indexers', (c) => c.catalog.indexers(), ['catalog.updated'])
  const toggle = useAction((c, id: string, enabled: boolean) =>
    c.indexers.update({ params: { id }, body: { enabled } }),
  )
  const test = useAction((c, id: string) => c.indexers.test({ body: { id } }))
  const retry = useAction((c, id: string) => c.indexers.retry({ params: { id } }))
  const remove = useAction((c, id: string) => c.indexers.remove({ params: { id } }))
  const [editing, setEditing] = useState<Indexer | null>(null)

  const runTest = (ix: Indexer) =>
    test.run(ix.id).then(
      (r) =>
        r.ok
          ? toast.success(t('works', { name: ix.name }), {
              description: t('worksDetail', { message: r.message, ms: r.latencyMs }),
            })
          : toast.error(t('noAnswer', { name: ix.name }), { description: r.message }),
      (e: Error) => toast.error(t('noAnswer', { name: ix.name }), { description: e.message }),
    )

  return (
    <Loadable query={list} what={t('installed.what')}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            icon="indexer"
            title={t('installed.none')}
            action={
              <Button variant="primary" icon="catalog" onClick={onBrowse}>
                {t('installed.browse')}
              </Button>
            }
          >
            {t('installed.noneBody')}
          </EmptyState>
        ) : (
          <>
            <TableFrame>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('col.indexer')}</TableHead>
                    <TableHead>{t('col.health')}</TableHead>
                    <TableHead numeric>{t('col.queries')}</TableHead>
                    <TableHead numeric>{t('col.grabs')}</TableHead>
                    <TableHead numeric>{t('col.response')}</TableHead>
                    <TableHead numeric>{t('col.success')}</TableHead>
                    <TableHead>{t('col.enabled')}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t('col.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {xs.map((ix) => {
                    const health: Health = ix.enabled ? ix.health : 'disabled'
                    return (
                      <TableRow key={ix.id}>
                        <TitleCell
                          title={
                            ix.local ? (
                              <span className="inline-flex items-center gap-2">
                                {ix.name}
                                <Badge tone="info">{t('local')}</Badge>
                              </span>
                            ) : (
                              ix.name
                            )
                          }
                          detail={t('detail', {
                            privacy: ix.privacy ? t(`privacy.${ix.privacy}`) : '',
                            priority: ix.priority,
                          })}
                        />
                        <TableCell className="max-w-72 whitespace-normal">
                          <Badge tone={healthTone[health]}>{t(`health.${health}`)}</Badge>
                          {health !== 'healthy' && health !== 'disabled' && (
                            <p className="mt-1 text-caption text-text-3">
                              {ix.lastError ?? t('notAnswering')}
                              {ix.backoffUntil
                                ? ` ${t('tryingAgain', { when: relative(ix.backoffUntil) })}`
                                : ''}
                            </p>
                          )}
                          {ix.needsAttention && (
                            <p className="mt-1 text-caption text-warning">
                              {ix.missing ? t('definitionGone') : t('needsSetting')}
                            </p>
                          )}
                        </TableCell>
                        <TableCell numeric>{ix.stats.queries24h}</TableCell>
                        <TableCell numeric>{ix.stats.grabs24h}</TableCell>
                        <TableCell numeric>
                          {ix.stats.avgResponseMs === null
                            ? t('none')
                            : t('ms', { ms: Math.round(ix.stats.avgResponseMs) })}
                        </TableCell>
                        <TableCell numeric>
                          {ix.stats.successRate === null
                            ? t('none')
                            : percent(ix.stats.successRate)}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={ix.enabled}
                            onCheckedChange={(on) =>
                              toggle.run(ix.id, on).catch((e: Error) =>
                                toast.error(t('changeFailed', { name: ix.name }), {
                                  description: e.message,
                                }),
                              )
                            }
                            aria-label={t('enabledLabel', { name: ix.name })}
                          />
                        </TableCell>
                        <TableCell className="text-end">
                          <span className="inline-flex gap-1">
                            {ix.health === 'backoff' && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  retry
                                    .run(ix.id)
                                    .then(() =>
                                      toast({ title: t('backInRotation', { name: ix.name }) }),
                                    )
                                }
                              >
                                {t('retry')}
                              </Button>
                            )}
                            <Menu>
                              <MenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  iconOnly
                                  icon="more"
                                  aria-label={t('more', { name: ix.name })}
                                />
                              </MenuTrigger>
                              <MenuContent>
                                <MenuItem icon="edit" onSelect={() => setEditing(ix)}>
                                  {t('edit')}
                                </MenuItem>
                                <MenuItem icon="network" onSelect={() => runTest(ix)}>
                                  {t('test')}
                                </MenuItem>
                                <MenuItem
                                  icon="delete"
                                  danger
                                  onSelect={() =>
                                    remove.run(ix.id).then(
                                      () => toast({ title: t('removed', { name: ix.name }) }),
                                      (e: Error) =>
                                        toast.error(t('removeFailed', { name: ix.name }), {
                                          description: e.message,
                                        }),
                                    )
                                  }
                                >
                                  {t('remove')}
                                </MenuItem>
                              </MenuContent>
                            </Menu>
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableFrame>
            <SettingsDialog
              mode="edit"
              indexer={editing}
              definition={
                editing ? (catalog.data?.find((d) => d.id === editing.definitionId) ?? null) : null
              }
              onOpenChange={(o) => !o && setEditing(null)}
            />
          </>
        )
      }
    </Loadable>
  )
}

// ---------------------------------------------------------------- catalog

function Catalog() {
  const t = useT(messages)
  const languageName = useLanguageName()
  const catalog = useQuery('catalog:indexers', (c) => c.catalog.indexers(), [
    'catalog.updated',
    'indexers.updated',
  ])
  const [text, setText] = useState('')
  const [privacy, setPrivacy] = useState<'all' | Privacy>('all')
  const [language, setLanguage] = useState('all')
  const [setting, setSetting] = useState<CatalogIndexer | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const add = useAction((c, definitionId: string) => c.indexers.add({ body: { definitionId } }))

  const oneClick = (d: CatalogIndexer) => {
    setAdding(d.id)
    add
      .run(d.id)
      .then(
        ({ test }) =>
          toast.success(t('catalog.added', { name: d.name }), { description: test.message }),
        (e: Error) =>
          toast.error(t('catalog.addFailed', { name: d.name }), {
            description: testOf(e)?.message ?? e.message,
          }),
      )
      .finally(() => setAdding(null))
  }

  return (
    <Loadable query={catalog} what={t('catalog.what')}>
      {(defs) => {
        const languages = [...new Set(defs.map((d) => d.language))]
        const q = text.trim().toLowerCase()
        const shown = defs.filter(
          (d) =>
            (privacy === 'all' || d.privacy === privacy) &&
            (language === 'all' || d.language === language) &&
            (!q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)),
        )
        return (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="search"
                icon="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('catalog.search')}
                aria-label={t('catalog.search')}
                className="w-64"
              />
              <SegmentedControl
                aria-label={t('catalog.privacy')}
                size="sm"
                value={privacy}
                onValueChange={(v) => setPrivacy(v as typeof privacy)}
                options={[
                  { value: 'all', label: t('catalog.all') },
                  { value: 'public', label: t('privacy.public') },
                  { value: 'semi-private', label: t('privacy.semi-private') },
                  { value: 'private', label: t('privacy.private') },
                ]}
              />
              <Select
                value={language}
                onValueChange={setLanguage}
                aria-label={t('catalog.language')}
                options={[
                  { value: 'all', label: t('catalog.everyLanguage') },
                  ...languages.map((l) => ({ value: l, label: languageName(l) })),
                ]}
                className="w-44"
              />
            </div>
            {shown.length === 0 ? (
              <EmptyState size="sm" icon="search" title={t('catalog.nothing')}>
                {t('catalog.nothingBody')}
              </EmptyState>
            ) : (
              <ul className="grid grid-cols-1 gap-3 medium:grid-cols-2 expanded:grid-cols-3">
                {shown.map((d) => (
                  <li
                    key={d.id}
                    className="grid content-between gap-3 rounded-lg border border-line bg-s1 p-4"
                  >
                    <div className="grid gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-text text-ui">{d.name}</h3>
                        <Badge tone={privacyTone[d.privacy]}>{t(`privacy.${d.privacy}`)}</Badge>
                        {d.local && <Badge tone="info">{t('local')}</Badge>}
                      </div>
                      <p className="text-caption text-text-2">{d.description}</p>
                      <p className="font-mono text-figure text-text-3">
                        {t('catalog.meta', {
                          language: languageName(d.language),
                          version: d.version,
                          license: d.license,
                        })}
                      </p>
                    </div>
                    {d.installed > 0 ? (
                      <Badge tone="neutral" className="justify-self-start">
                        {t('catalog.installed')}
                      </Badge>
                    ) : isOneClick(d) ? (
                      <Button
                        size="sm"
                        icon="add"
                        loading={adding === d.id}
                        onClick={() => oneClick(d)}
                        aria-label={t('catalog.addLabel', { name: d.name })}
                        className="justify-self-start"
                      >
                        {t('catalog.add')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        icon="settings"
                        onClick={() => setSetting(d)}
                        aria-label={t('catalog.setUpLabel', { name: d.name })}
                        className="justify-self-start"
                      >
                        {t('catalog.setUp')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <SettingsDialog
              mode="add"
              indexer={null}
              definition={setting}
              onOpenChange={(o) => !o && setSetting(null)}
            />
          </div>
        )
      }}
    </Loadable>
  )
}

/** A failed add's test result: the server answers 400 with it in `details.test`. */
function testOf(e: unknown): IndexerTestResult | null {
  if (!(e instanceof ApiError)) return null
  const test = (e.details as { test?: IndexerTestResult } | undefined)?.test
  return test ?? null
}

// ---------------------------------------------------------------- the generated form

type Value = string | boolean

const initialValues = (fields: SettingField[], indexer: Indexer | null) =>
  Object.fromEntries(
    fields.map((f): [string, Value] => {
      const saved = indexer?.settings.values[f.key]
      if (f.secret || f.type === 'password') return [f.key, '']
      const v = saved ?? f.default
      if (f.type === 'checkbox') return [f.key, v === true || v === 'true']
      return [f.key, v === undefined ? '' : String(v)]
    }),
  )

/** The values as settings: numbers as numbers, empty secrets as empty (the server keeps them). */
const toSettings = (fields: SettingField[], values: Record<string, Value>) =>
  Object.fromEntries(
    fields.map((f): [string, string | number | boolean | null] => {
      const v = values[f.key]
      if (f.type === 'checkbox') return [f.key, v === true]
      const s = typeof v === 'string' ? v.trim() : ''
      if (f.type === 'number') return [f.key, s === '' ? null : Number(s)]
      return [f.key, s]
    }),
  )

/** An indexer's seeding rule (A9) as the Edit dialog types it: hours where the API has minutes. */
const seedingText = (indexer: Indexer | null) => ({
  ratio: ratioText(indexer?.seeding.ratio ?? null),
  hours: hoursText(indexer?.seeding.minutes ?? null),
  minHours: hoursText(indexer?.seeding.minMinutes ?? null),
})

/** The rule to save, null fields using Download client's; undefined while a field is invalid. */
function seedingOf(text: ReturnType<typeof seedingText>): Indexer['seeding'] | undefined {
  const ratio = ratioOf(text.ratio)
  const minutes = minutesOf(text.hours)
  const minMinutes = minutesOf(text.minHours)
  if (ratio === undefined || minutes === undefined || minMinutes === undefined) return undefined
  return { ratio, minutes, minMinutes }
}

/** Set up (add) or Edit: the definition's fields, plus the name, priority and seeding rule when
 * editing. */
function SettingsDialog({
  mode,
  indexer,
  definition: d,
  onOpenChange,
}: {
  mode: 'add' | 'edit'
  indexer: Indexer | null
  definition: CatalogIndexer | null
  onOpenChange: (o: boolean) => void
}) {
  const open = mode === 'edit' ? !!indexer : !!d
  // remounted per indexer or definition, so the form starts from its values
  const key = mode === 'edit' ? (indexer?.id ?? '') : (d?.id ?? '')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SettingsForm
          key={key}
          mode={mode}
          indexer={indexer}
          definition={d}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}

function SettingsForm({
  mode,
  indexer,
  definition: d,
  onClose,
}: {
  mode: 'add' | 'edit'
  indexer: Indexer | null
  definition: CatalogIndexer | null
  onClose: () => void
}) {
  const t = useT(messages)
  const fields = d?.settings ?? []
  const [initial] = useState(() => initialValues(fields, indexer))
  const [values, setValues] = useState<Record<string, Value>>(initial)
  const [name, setName] = useState(indexer?.name ?? '')
  const [priority, setPriority] = useState(String(indexer?.priority ?? 25))
  const [seeding, setSeeding] = useState(() => seedingText(indexer))
  const [touched, setTouched] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const save = useAction(async (c) => {
    const settings = toSettings(fields, values)
    if (mode === 'add' && d)
      return (await c.indexers.add({ body: { definitionId: d.id, settings } })).indexer.name
    if (!indexer) return ''
    const changed = fields.some((f) => values[f.key] !== initial[f.key])
    const rule = seedingOf(seeding)
    const was = indexer.seeding
    const seedingChanged =
      rule?.ratio !== was.ratio ||
      rule?.minutes !== was.minutes ||
      rule?.minMinutes !== was.minMinutes
    const saved = await c.indexers.update({
      params: { id: indexer.id },
      body: {
        name: name.trim(),
        priority: Number(priority),
        ...(changed ? { settings } : {}),
        ...(seedingChanged && rule ? { seeding: rule } : {}),
      },
    })
    return saved.name
  })

  const isSet = (f: SettingField) => indexer?.settings.secrets[f.key] === true
  const missing = (f: SettingField) => {
    if (!f.required || f.type === 'checkbox') return false
    const v = values[f.key]
    const empty = typeof v !== 'string' || !v.trim()
    return empty && !isSet(f) && f.default === undefined
  }
  const priorityOk = /^\d+$/.test(priority) && Number(priority) >= 1 && Number(priority) <= 50
  const nameOk = name.trim().length > 0
  const seedOk = {
    ratio: ratioOf(seeding.ratio) !== undefined,
    hours: minutesOf(seeding.hours) !== undefined,
    minHours: minutesOf(seeding.minHours) !== undefined,
  }

  const submit = async () => {
    setTouched(true)
    setFailure(null)
    if (fields.some(missing)) return
    if (mode === 'edit' && (!priorityOk || !nameOk || !seedingOf(seeding))) return
    try {
      const saved = await save.run()
      onClose()
      if (mode === 'add')
        toast.success(t('form.added', { name: saved }), { description: t('form.addedDetail') })
      else toast.success(t('form.saved', { name: saved }))
    } catch (e) {
      setFailure(testOf(e)?.message ?? (e as Error).message)
    }
  }

  const set = (k: string, v: Value) => setValues((old) => ({ ...old, [k]: v }))
  const title =
    mode === 'add'
      ? t('form.setUpTitle', { name: d?.name ?? '' })
      : t('form.editTitle', { name: indexer?.name ?? '' })

  return (
    <DialogContent
      size="md"
      title={title}
      description={t('form.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" loading={save.pending} onClick={submit}>
            {mode === 'add' ? t('form.testAndSave') : t('form.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {mode === 'edit' && (
          <>
            <Field
              label={t('form.name')}
              error={touched && !nameOk ? t('form.nameRequired') : undefined}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </Field>
            <Field
              label={t('form.priority')}
              hint={t('form.priorityHint')}
              error={touched && !priorityOk ? t('form.priorityInvalid') : undefined}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-28"
              />
            </Field>
            <fieldset className="grid gap-3">
              <legend className="mb-1 font-medium text-text text-ui">{t('form.seeding')}</legend>
              <p className="text-caption text-text-3">{t('form.seedingHint')}</p>
              <div className="grid gap-4 medium:grid-cols-3">
                <Field
                  label={t('form.seedRatio')}
                  error={touched && !seedOk.ratio ? t('form.seedRatioInvalid') : undefined}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.1"
                    value={seeding.ratio}
                    placeholder={t('form.seedDefault')}
                    onChange={(e) => setSeeding({ ...seeding, ratio: e.target.value })}
                  />
                </Field>
                <Field
                  label={t('form.seedHours')}
                  error={touched && !seedOk.hours ? t('form.seedHoursInvalid') : undefined}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={seeding.hours}
                    placeholder={t('form.seedDefault')}
                    onChange={(e) => setSeeding({ ...seeding, hours: e.target.value })}
                  />
                </Field>
                <Field
                  label={t('form.seedMinHours')}
                  hint={t('form.seedMinHoursHint')}
                  error={touched && !seedOk.minHours ? t('form.seedHoursInvalid') : undefined}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={seeding.minHours}
                    placeholder={t('form.seedNone')}
                    onChange={(e) => setSeeding({ ...seeding, minHours: e.target.value })}
                  />
                </Field>
              </div>
            </fieldset>
          </>
        )}
        {fields.map((f) => {
          const error =
            touched && missing(f) ? t('form.required', { label: f.label.toLowerCase() }) : undefined
          const secret = f.secret || f.type === 'password'
          const hint = secret && isSet(f) ? t('form.secretKept') : (f.help ?? undefined)
          if (f.type === 'checkbox')
            return (
              <Field key={f.key} label={f.label} hint={f.help ?? undefined} inline>
                <Checkbox
                  checked={values[f.key] === true}
                  onCheckedChange={(on) => set(f.key, on === true)}
                />
              </Field>
            )
          if (f.type === 'select')
            return (
              <Field key={f.key} label={f.label} hint={hint} error={error}>
                <Select
                  value={
                    typeof values[f.key] === 'string' && values[f.key]
                      ? String(values[f.key])
                      : undefined
                  }
                  onValueChange={(v) => set(f.key, v)}
                  placeholder={t('form.choose')}
                  options={(f.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
                />
              </Field>
            )
          return (
            <Field key={f.key} label={f.label} hint={hint} error={error}>
              <Input
                type={
                  secret
                    ? 'password'
                    : f.type === 'number'
                      ? 'number'
                      : f.type === 'url'
                        ? 'url'
                        : 'text'
                }
                value={String(values[f.key] ?? '')}
                onChange={(e) => set(f.key, e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          )
        })}
        {failure && (
          <p
            role="alert"
            className="rounded-md border border-line bg-s2 p-3 text-caption text-danger"
          >
            {failure}
          </p>
        )}
      </form>
    </DialogContent>
  )
}
