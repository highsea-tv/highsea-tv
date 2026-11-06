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
// Since D2 (one-client-platform-d.md) it's drawn with the library's native renderer, on the web
// through react-native-web, with the same parts, words and behaviour as the web renderer's.
import type {
  CatalogIndexer,
  CatalogStatus,
  Indexer,
  IndexerTestResult,
  SettingField,
} from '@highsea-tv/api-contract'
import { percent } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  type BadgeTone,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  SearchField,
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
  Text,
  TitleCell,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { hoursText, minutesOf, ratioOf, ratioText } from './download-client-seeding.ts'
import { indexers as messages } from './indexers-messages.ts'
import { Loadable } from './loadable.tsx'
import { AdminPage } from './shell.tsx'
import { RowMenu } from './table-parts.tsx'
import { useTabAddress } from './tabs.ts'
import { TagPicker } from './tag-picker.tsx'
import { tagsMessages } from './tags-messages.ts'
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

export type IndexersTab = 'installed' | 'catalog'
type Tab = IndexersTab

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

const sp = tokens.space
const ui = tokens.adminText.ui

/** A caption-sized note in a colour (the web's `text-caption text-…`). */
function Note({
  children,
  color = 'text-3',
}: {
  children: ReactNode
  color?: 'text-2' | 'text-3' | 'warning'
}) {
  return (
    <Text variant="caption" color={color}>
      {children}
    </Text>
  )
}

/** A failed save's words, in a box on `s2` (the web's `rounded-md border bg-s2 p-3`). */
function Failure({ children }: { children: string }) {
  const theme = useTheme()
  return (
    <View
      role="alert"
      style={{
        padding: sp['3'],
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.s2,
      }}
    >
      <Text variant="caption" color="danger">
        {children}
      </Text>
    </View>
  )
}

export function Indexers({ tab = 'installed' }: { tab?: Tab }) {
  const t = useT(messages)
  const setTab = useTabAddress<Tab>('/indexers', 'installed')
  const installed = useQuery('indexers', (c) => c.indexers.list(), LIVE)
  const status = useQuery('catalog:status', (c) => c.catalog.status(), ['catalog.updated'])
  const [notes, setNotes] = useState(false)
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'installed', label: t('tab.installed'), count: installed.data?.length || undefined },
    { value: 'catalog', label: t('tab.catalog') },
  ]

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
            <InlineButton onPress={() => setNotes(true)}>{t('whatChanged')}</InlineButton>
          </>
        ) : undefined
      }
      actions={
        <Button variant="primary" icon="add" onPress={() => setTab('catalog')}>
          {t('add')}
        </Button>
      }
    >
      <View>
        <Tabs
          variant="line"
          aria-label={t('sections')}
          options={tabs}
          value={tab}
          onValueChange={setTab}
        />
        <View
          role="tabpanel"
          aria-label={tabs.find((x) => x.value === tab)?.label}
          style={{ paddingTop: sp['5'] }}
        >
          {tab === 'installed' ? <Installed onBrowse={() => setTab('catalog')} /> : <Catalog />}
        </View>
      </View>
      {status.data && (
        <WhatChanged status={status.data} open={notes} onClose={() => setNotes(false)} />
      )}
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
      <Text variant="caption" mono color="text-3">
        {value}
      </Text>
      {text.slice(at + value.length)}
    </>
  )
}

/**
 * A button inside a line of text (the prototype’s underlined button in the page’s description): a
 * nested Text with its own press (https://reactnative.dev/docs/text#nested-text), which
 * react-native-web draws with the button role, a tab stop; Enter and Space press it, as a
 * button's keys do (https://www.w3.org/WAI/ARIA/apg/patterns/button/).
 */
function InlineButton({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Text
      variant="caption"
      color="text-3"
      role="button"
      onPress={onPress}
      {...({
        onKeyDown: (e: { key: string; preventDefault: () => void }) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onPress()
        },
      } as object)}
      style={{ textDecorationLine: 'underline' }}
    >
      {children}
    </Text>
  )
}

// ---------------------------------------------------------------- what changed

function WhatChanged({
  status,
  open,
  onClose,
}: {
  status: CatalogStatus
  open: boolean
  onClose: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const install = useAction((c) => c.catalog.install())
  const available = status.available
  return (
    <Dialog open={open} onClose={onClose} closable title={t('changes.title')} size="md">
      <View style={{ gap: sp['4'] }}>
        {available && (
          <View
            style={{
              gap: sp['2'],
              padding: sp['3'],
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.s2,
            }}
          >
            <Text>{t('changes.available', { version: available.version })}</Text>
            <ChangeList changes={available.changes} />
            <View style={{ alignItems: 'flex-start' }}>
              <Button
                size="sm"
                variant="primary"
                loading={install.pending}
                onPress={() =>
                  install.run().then(
                    (s) => toast.success(t('changes.installed', { version: s.version ?? '' })),
                    (e: Error) =>
                      toast.error(t('changes.installFailed'), { description: e.message }),
                  )
                }
              >
                {t('changes.install', { version: available.version })}
              </Button>
            </View>
          </View>
        )}
        {status.changes.length === 0 && !available ? (
          <Text color="text-2">{t('changes.none')}</Text>
        ) : (
          <ChangeList changes={status.changes} />
        )}
      </View>
    </Dialog>
  )
}

/** The web's list-disc's indent: the bullet in it, the note after. */
const BULLET = 20

function ChangeList({ changes }: { changes: CatalogStatus['changes'] }) {
  return (
    <View role="list" style={{ gap: sp['4'] }}>
      {changes.map((c) => (
        <View key={c.version} role="listitem" style={{ gap: sp['1'] }}>
          <Text size={ui.size} leading={ui.leading} mono weight={600} role="heading" aria-level={3}>
            {c.version}
          </Text>
          <View role="list" style={{ gap: sp['0.5'] }}>
            {c.notes.map((n) => (
              <View key={n} role="listitem" style={{ flexDirection: 'row' }}>
                <Text color="text-2" aria-hidden style={{ width: BULLET, textAlign: 'center' }}>
                  •
                </Text>
                <Text color="text-2" style={{ flex: 1, minWidth: 0 }}>
                  {n}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------- installed

/** The health column's widest (the web's max-w-72). */
const HEALTH_WIDTH = 288

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
              <Button variant="primary" icon="catalog" onPress={onBrowse}>
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
                    <TableHead hidden>{t('col.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {xs.map((ix) => {
                    const health: Health = ix.enabled ? ix.health : 'disabled'
                    const detail = t('detail', {
                      privacy: ix.privacy ? t(`privacy.${ix.privacy}`) : '',
                      priority: ix.priority,
                    })
                    return (
                      <TableRow key={ix.id}>
                        <TableCell tall>
                          {ix.local ? (
                            <LocalTitle name={ix.name} detail={detail} />
                          ) : (
                            <TitleCell title={ix.name} detail={detail} />
                          )}
                        </TableCell>
                        <TableCell maxWidth={HEALTH_WIDTH}>
                          <View style={{ alignItems: 'flex-start', gap: sp['1'], minWidth: 0 }}>
                            <Badge tone={healthTone[health]}>{t(`health.${health}`)}</Badge>
                            {health !== 'healthy' && health !== 'disabled' && (
                              <Note>
                                {ix.lastError ?? t('notAnswering')}
                                {ix.backoffUntil
                                  ? ` ${t('tryingAgain', { when: relative(ix.backoffUntil) })}`
                                  : ''}
                              </Note>
                            )}
                            {ix.needsAttention && (
                              <Note color="warning">
                                {ix.missing ? t('definitionGone') : t('needsSetting')}
                              </Note>
                            )}
                          </View>
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
                            label={t('enabledLabel', { name: ix.name })}
                            hideLabel
                            checked={ix.enabled}
                            onCheckedChange={(on) =>
                              toggle.run(ix.id, on).catch((e: Error) =>
                                toast.error(t('changeFailed', { name: ix.name }), {
                                  description: e.message,
                                }),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell align="end">
                          <View style={{ flexDirection: 'row', gap: sp['1'] }}>
                            {ix.health === 'backoff' && (
                              <Button
                                size="sm"
                                onPress={() =>
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
                            <RowMenu
                              label={t('more', { name: ix.name })}
                              items={[
                                { label: t('edit'), icon: 'edit', onSelect: () => setEditing(ix) },
                                { label: t('test'), icon: 'network', onSelect: () => runTest(ix) },
                                {
                                  label: t('remove'),
                                  icon: 'delete',
                                  closes: 'gone',
                                  onSelect: () =>
                                    remove.run(ix.id).then(
                                      () => toast({ title: t('removed', { name: ix.name }) }),
                                      (e: Error) =>
                                        toast.error(t('removeFailed', { name: ix.name }), {
                                          description: e.message,
                                        }),
                                    ),
                                },
                              ]}
                            />
                          </View>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableFrame>
            {editing && (
              <SettingsForm
                key={editing.id}
                mode="edit"
                indexer={editing}
                definition={catalog.data?.find((d) => d.id === editing.definitionId) ?? null}
                onClose={() => setEditing(null)}
              />
            )}
          </>
        )
      }
    </Loadable>
  )
}

/** A title cell with the Local badge after the name, laid out as TitleCell lays out its text. */
function LocalTitle({ name, detail }: { name: string; detail: string }) {
  const t = useT(messages)
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp['2'], minWidth: 0 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Text>
        <Badge tone="info">{t('local')}</Badge>
      </View>
      <Text variant="caption" mono color="text-3" numberOfLines={1}>
        {detail}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------- catalog

/** The search field's width in a regular window (the web's w-64), and the language's (w-44). */
const SEARCH_WIDTH = 256
const LANGUAGE_WIDTH = 176

/** `items` in rows of `per`, the last filled out so every card keeps its column's width. */
function rowsOf<T>(items: readonly T[], per: number): (T | null)[][] {
  const rows: (T | null)[][] = []
  for (let i = 0; i < items.length; i += per) {
    const row: (T | null)[] = items.slice(i, i + per)
    while (row.length < per) row.push(null)
    rows.push(row)
  }
  return rows
}

function Catalog() {
  const t = useT(messages)
  const languageName = useLanguageName()
  const medium = useWindowAtLeast(breakpoints.medium)
  const expanded = useWindowAtLeast(breakpoints.expanded)
  const per = expanded ? 3 : medium ? 2 : 1
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
          <View style={{ gap: sp['4'], minWidth: 0 }}>
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['2'] }}
            >
              <View style={{ width: medium ? SEARCH_WIDTH : '100%' }}>
                <SearchField
                  label={t('catalog.search')}
                  placeholder={t('catalog.search')}
                  value={text}
                  onChangeText={setText}
                />
              </View>
              <SegmentedControl
                aria-label={t('catalog.privacy')}
                value={privacy}
                onValueChange={(v) => setPrivacy(v as typeof privacy)}
                options={[
                  { value: 'all', label: t('catalog.all') },
                  { value: 'public', label: t('privacy.public') },
                  { value: 'semi-private', label: t('privacy.semi-private') },
                  { value: 'private', label: t('privacy.private') },
                ]}
              />
              <View style={{ width: LANGUAGE_WIDTH }}>
                <Select
                  value={language}
                  onValueChange={setLanguage}
                  aria-label={t('catalog.language')}
                  options={[
                    { value: 'all', label: t('catalog.everyLanguage') },
                    ...languages.map((l) => ({ value: l, label: languageName(l) })),
                  ]}
                />
              </View>
            </View>
            {shown.length === 0 ? (
              <EmptyState icon="search" title={t('catalog.nothing')}>
                {t('catalog.nothingBody')}
              </EmptyState>
            ) : (
              <View role="list" style={{ gap: sp['3'] }}>
                {rowsOf(shown, per).map((row) => (
                  <View
                    key={row.map((d) => d?.id ?? '').join(' ')}
                    style={{ flexDirection: 'row', gap: sp['3'] }}
                  >
                    {row.map((d, i) =>
                      d ? (
                        <CatalogCard
                          key={d.id}
                          d={d}
                          adding={adding === d.id}
                          onAdd={() => oneClick(d)}
                          onSetUp={() => setSetting(d)}
                        />
                      ) : (
                        // biome-ignore lint/suspicious/noArrayIndexKey: the row's empty places, in order
                        <View key={i} style={{ flex: 1, flexBasis: 0 }} />
                      ),
                    )}
                  </View>
                ))}
              </View>
            )}
            {setting && (
              <SettingsForm
                key={setting.id}
                mode="add"
                indexer={null}
                definition={setting}
                onClose={() => setSetting(null)}
              />
            )}
          </View>
        )
      }}
    </Loadable>
  )
}

function CatalogCard({
  d,
  adding,
  onAdd,
  onSetUp,
}: {
  d: CatalogIndexer
  adding: boolean
  onAdd: () => void
  onSetUp: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const languageName = useLanguageName()
  const figure = tokens.adminText.figure
  return (
    <View
      role="listitem"
      style={{
        flex: 1,
        flexBasis: 0,
        minWidth: 0,
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: sp['3'],
        padding: sp['4'],
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.s1,
      }}
    >
      <View style={{ alignSelf: 'stretch', gap: sp['1'] + sp['0.5'] }}>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['2'] }}
        >
          <Text size={ui.size} leading={ui.leading} weight={600} role="heading" aria-level={3}>
            {d.name}
          </Text>
          <Badge tone={privacyTone[d.privacy]}>{t(`privacy.${d.privacy}`)}</Badge>
          {d.local && <Badge tone="info">{t('local')}</Badge>}
        </View>
        <Note color="text-2">{d.description}</Note>
        <Text size={figure.size} leading={figure.leading} mono color="text-3">
          {t('catalog.meta', {
            language: languageName(d.language),
            version: d.version,
            license: d.license,
          })}
        </Text>
      </View>
      {d.installed > 0 ? (
        <Badge tone="neutral">{t('catalog.installed')}</Badge>
      ) : isOneClick(d) ? (
        <Button
          size="sm"
          icon="add"
          loading={adding}
          onPress={onAdd}
          accessibilityLabel={t('catalog.addLabel', { name: d.name })}
        >
          {t('catalog.add')}
        </Button>
      ) : (
        <Button
          size="sm"
          icon="settings"
          hasPopup="dialog"
          onPress={onSetUp}
          accessibilityLabel={t('catalog.setUpLabel', { name: d.name })}
        >
          {t('catalog.setUp')}
        </Button>
      )}
    </View>
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

/** The priority field's width (the web's w-28). */
const PRIORITY_WIDTH = 112

/** Set up (add) or Edit: the definition's fields, plus the name, priority and seeding rule when
 * editing. Drawn per indexer or definition, so the form starts from its values. */
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
  const tt = useT(tagsMessages)
  const wide = useWindowAtLeast(breakpoints.medium)
  const fields = d?.settings ?? []
  const [initial] = useState(() => initialValues(fields, indexer))
  const [values, setValues] = useState<Record<string, Value>>(initial)
  const [name, setName] = useState(indexer?.name ?? '')
  const [priority, setPriority] = useState(String(indexer?.priority ?? 25))
  const [tags, setTags] = useState<string[]>(indexer?.tags ?? [])
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
        tags,
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
  /** Enter in a field submits, as the web's form does. */
  const typed = { onSubmitEditing: submit, autoComplete: 'off', autoCorrect: false } as const
  const seedField = { flex: wide ? 1 : undefined, minWidth: 0 } as const

  return (
    <Dialog
      open
      onClose={onClose}
      closable
      size="md"
      title={title}
      description={t('form.description')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" loading={save.pending} onPress={submit}>
            {mode === 'add' ? t('form.testAndSave') : t('form.save')}
          </Button>
        </>
      }
    >
      <View style={{ gap: sp['4'] }}>
        {mode === 'edit' && (
          <>
            <Field
              label={t('form.name')}
              error={touched && !nameOk ? t('form.nameRequired') : undefined}
            >
              <Input value={name} onChangeText={setName} maxLength={60} {...typed} />
            </Field>
            <Field
              label={t('form.priority')}
              hint={t('form.priorityHint')}
              error={touched && !priorityOk ? t('form.priorityInvalid') : undefined}
            >
              <View style={{ width: PRIORITY_WIDTH }}>
                <Input
                  inputMode="numeric"
                  keyboardType="number-pad"
                  value={priority}
                  onChangeText={setPriority}
                  {...typed}
                />
              </View>
            </Field>
            <Field label={tt('label')} hint={tt('hint.indexer')}>
              <TagPicker value={tags} onChange={setTags} />
            </Field>
            <View role="group" aria-label={t('form.seeding')} style={{ gap: sp['3'] }}>
              {/* the legend: the group is named by it, so it's read once, as the group's name */}
              <Text size={ui.size} leading={ui.leading} weight={500} aria-hidden>
                {t('form.seeding')}
              </Text>
              <Note>{t('form.seedingHint')}</Note>
              <View style={{ flexDirection: wide ? 'row' : 'column', gap: sp['4'] }}>
                <View style={seedField}>
                  <Field
                    label={t('form.seedRatio')}
                    error={touched && !seedOk.ratio ? t('form.seedRatioInvalid') : undefined}
                  >
                    <Input
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      value={seeding.ratio}
                      placeholder={t('form.seedDefault')}
                      onChangeText={(v) => setSeeding({ ...seeding, ratio: v })}
                      {...typed}
                    />
                  </Field>
                </View>
                <View style={seedField}>
                  <Field
                    label={t('form.seedHours')}
                    error={touched && !seedOk.hours ? t('form.seedHoursInvalid') : undefined}
                  >
                    <Input
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      value={seeding.hours}
                      placeholder={t('form.seedDefault')}
                      onChangeText={(v) => setSeeding({ ...seeding, hours: v })}
                      {...typed}
                    />
                  </Field>
                </View>
                <View style={seedField}>
                  <Field
                    label={t('form.seedMinHours')}
                    hint={t('form.seedMinHoursHint')}
                    error={touched && !seedOk.minHours ? t('form.seedHoursInvalid') : undefined}
                  >
                    <Input
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      value={seeding.minHours}
                      placeholder={t('form.seedNone')}
                      onChangeText={(v) => setSeeding({ ...seeding, minHours: v })}
                      {...typed}
                    />
                  </Field>
                </View>
              </View>
            </View>
          </>
        )}
        {fields.map((f) => {
          const error =
            touched && missing(f) ? t('form.required', { label: f.label.toLowerCase() }) : undefined
          const secret = f.secret || f.type === 'password'
          const hint = secret && isSet(f) ? t('form.secretKept') : (f.help ?? undefined)
          if (f.type === 'checkbox')
            return (
              <Checkbox
                key={f.key}
                label={f.label}
                hint={f.help ?? undefined}
                checked={values[f.key] === true}
                onCheckedChange={(on) => set(f.key, on)}
              />
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
                secureTextEntry={secret}
                inputMode={f.type === 'number' ? 'numeric' : f.type === 'url' ? 'url' : 'text'}
                keyboardType={
                  f.type === 'number' ? 'number-pad' : f.type === 'url' ? 'url' : 'default'
                }
                autoCapitalize="none"
                spellCheck={false}
                value={String(values[f.key] ?? '')}
                onChangeText={(v) => set(f.key, v)}
                {...typed}
              />
            </Field>
          )
        })}
        {failure && <Failure>{failure}</Failure>}
      </View>
    </Dialog>
  )
}
