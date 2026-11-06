'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A10 Subtitles (subtitles.md), ported from the signed-off prototype
// (design/prototypes/src/admin/subtitles/subtitles.tsx): the wanted list with search for one or
// all, then the providers, the language profiles and the scoring and sync settings. What real data
// changes from the prototype (checkpoint 7a):
// - the wanted list comes a page at a time, with Show more under it; the tab and the toolbar count
//   every movie wanting something, not the page;
// - the providers are the real three. Each has Edit, the owner's only, a dialog built like A9's:
//   the account's fields (a saved secret stays empty and is kept), Test, then Save. A provider
//   that needs an account can't be turned on without one; one this build can't use says why. A
//   throttled provider's bar is empty in warning tone, with the reason and when it resumes, and
//   a count the provider doesn't report is a dash. The attribution its terms ask for is under the
//   table;
// - a new profile gets its id from the server; a refused delete (a profile in use) says why;
// - the minimum score hint says "about 99", the score a hash match gets (judgement call 8).
// Since D2 (one-client-platform-d.md) it's drawn with the library's native renderer, on the web
// through react-native-web, with the same parts, words and behaviour as the web renderer's.
import type {
  Language,
  LanguageProfile,
  SubtitleProvider,
  SubtitleProviderCredentials,
  SubtitleProviderTest,
  SubtitleSettings,
  WantedSubtitlesPage,
} from '@highsea-tv/api-contract'
import { percent } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import type { HighseaClient } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints, type ColorRole } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Panel,
  ProgressBar,
  Select,
  SortableList,
  Stat,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  Text,
  TitleCell,
  TitleLink,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { AdminPage, useShell } from './shell.tsx'
import { subtitles as messages } from './subtitles-messages.ts'
import { Muted } from './table-parts.tsx'
import { useTabAddress } from './tabs.ts'
import { useRelative } from './time.ts'

export type SubtitlesTab = 'wanted' | 'providers' | 'languages' | 'scoring'
type Tab = SubtitlesTab
type LanguageRule = LanguageProfile['languages'][number]
type ProfileDraft = Omit<LanguageProfile, 'id'> & { id: string | null }

const TOPICS = ['subtitles.updated']
/** Movies a page of the wanted list adds. */
const PAGE = 50

const sp = tokens.space
const ui = tokens.adminText.ui
/** A row of controls that wraps (the web's `flex flex-wrap gap-2`). */
const ROW = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['2'] } as const
/** Pushes what follows to the row's end (the web's `ms-auto`). */
const END = { marginStart: 'auto' } as const

export function Subtitles({ tab = 'wanted' }: { tab?: Tab }) {
  const t = useT(messages)
  const setTab = useTabAddress<Tab>('/subtitles', 'wanted')
  const total = useQuery(
    'subtitles:wanted-total',
    async (c) => (await c.subtitles.wanted({ query: { limit: 1 } })).total,
    TOPICS,
  )
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'wanted', label: t('tab.wanted'), count: total.data || undefined },
    { value: 'providers', label: t('tab.providers') },
    { value: 'languages', label: t('tab.languages') },
    { value: 'scoring', label: t('tab.scoring') },
  ]
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <Stats />
      <View>
        {/* the tabs scroll sideways rather than wrap in a narrow window (the web's overflow-x-auto),
            and their rule runs the page's width, as the web's line list does */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={{ flexGrow: 1 }}>
            <Tabs
              variant="line"
              aria-label={t('sections')}
              options={tabs}
              value={tab}
              onValueChange={setTab}
            />
          </View>
        </ScrollView>
        <View
          role="tabpanel"
          aria-label={tabs.find((x) => x.value === tab)?.label}
          style={{ paddingTop: sp['5'] }}
        >
          {tab === 'wanted' ? (
            <Wanted />
          ) : tab === 'providers' ? (
            <Providers />
          ) : tab === 'languages' ? (
            <Languages />
          ) : (
            <Scoring />
          )}
        </View>
      </View>
    </AdminPage>
  )
}

function Stats() {
  const t = useT(messages)
  const four = useWindowAtLeast(breakpoints.medium)
  const stats = useQuery('subtitles:stats', (c) => c.subtitles.stats(), TOPICS)
  if (stats.status !== 'success') return null
  const s = stats.data
  // two to a row in a compact window, four otherwise; each grows to an equal share
  const cell = { flexGrow: 1, flexBasis: four ? '20%' : '40%', minWidth: 0 } as const
  return (
    <Panel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp['4'] }}>
        <View style={cell}>
          <Stat value={String(s.syncedToday)} caption={t('stats.synced')} />
        </View>
        <View style={cell}>
          <Stat value={String(s.waiting)} caption={t('stats.waiting')} />
        </View>
        <View style={cell}>
          <Stat value={String(s.avgOffsetMs)} unit="ms" caption={t('stats.offset')} />
        </View>
        <View style={cell}>
          <Stat value={percent(s.avgConfidence)} caption={t('stats.confidence')} />
        </View>
      </View>
    </Panel>
  )
}

/** A caption-sized note in a colour (the web's `text-caption text-…`). */
function Note({
  children,
  color = 'text-3',
  role,
}: {
  children: ReactNode
  color?: ColorRole
  role?: 'alert' | 'status'
}) {
  return (
    <Text variant="caption" color={color} role={role}>
      {children}
    </Text>
  )
}

/** The answer a test or a save gave, in a box on `s2` (the web's `rounded-md border bg-s2 p-3`). */
function Answer({ ok, children }: { ok: boolean; children: string }) {
  const theme = useTheme()
  return (
    <View
      role={ok ? 'status' : 'alert'}
      style={{
        padding: sp['3'],
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.s2,
      }}
    >
      <Text variant="caption" color={ok ? 'success' : 'danger'}>
        {children}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------- wanted

/** The wanted list up to `count` movies, following the cursor (Show more asks for more). */
async function loadWanted(c: HighseaClient, count: number): Promise<WantedSubtitlesPage> {
  const items: WantedSubtitlesPage['items'] = []
  let cursor: string | undefined
  let page: WantedSubtitlesPage
  do {
    page = await c.subtitles.wanted({
      query: { cursor, limit: Math.min(200, count - items.length) },
    })
    items.push(...page.items)
    cursor = page.next ?? undefined
  } while (cursor && items.length < count)
  return { ...page, items }
}

function Wanted() {
  const t = useT(messages)
  const [count, setCount] = useState(PAGE)
  const data = useQuery(
    `subtitles:wanted:${count}`,
    async (c) => {
      const [wanted, languages] = await Promise.all([loadWanted(c, count), c.subtitles.languages()])
      return { wanted, languages }
    },
    TOPICS,
  )
  // Show more keeps what's on screen while the longer list loads
  const last = useRef<typeof data.data>(undefined)
  if (data.status === 'success') last.current = data.data
  const kept = data.status === 'loading' ? last.current : undefined
  const shown = kept
    ? {
        status: 'success' as const,
        data: kept,
        error: undefined,
        refetch: data.refetch,
        refresh: data.refresh,
      }
    : data

  const searchAll = useAction((c) => c.subtitles.searchAllMissing())
  const searchOne = useAction(async (c, id: number, language: string) => {
    const [best] = await c.subtitles.search({ params: { id }, body: { language } })
    if (!best) throw new Error(t('wanted.noResults'))
    return c.subtitles.download({ params: { id }, body: { resultId: best.id } })
  })
  return (
    <Loadable query={shown} what={t('wanted.what')}>
      {({ wanted, languages }) => {
        const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code
        if (wanted.items.length === 0)
          return (
            <EmptyState icon="subtitles" title={t('wanted.none')}>
              {t('wanted.noneBody')}
            </EmptyState>
          )
        return (
          <View style={{ gap: sp['4'] }}>
            <TableFrame>
              <TableToolbar>
                <Text size={ui.size} leading={ui.leading}>
                  {t('wanted.count', { count: wanted.total })}
                </Text>
                <View style={END}>
                  <Button
                    size="sm"
                    icon="search"
                    loading={searchAll.pending}
                    onPress={() =>
                      searchAll.run().then(
                        ({ queued }) =>
                          toast.success(t('wanted.searchedAll'), {
                            description: t('wanted.searchedAllBody', { count: queued }),
                          }),
                        (e: Error) => toast.error(t('failed'), { description: e.message }),
                      )
                    }
                  >
                    {t('wanted.searchAll')}
                  </Button>
                </View>
              </TableToolbar>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('wanted.movie')}</TableHead>
                    <TableHead>{t('wanted.missing')}</TableHead>
                    <TableHead hidden>{t('wanted.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wanted.items.map(({ movie: m, missingLanguages }) => (
                    <TableRow key={m.id}>
                      <TableCell tall truncate>
                        <TitleCell
                          title={
                            <TitleLink href={moviePath(m.id)}>
                              {m.year ? `${m.title} (${m.year})` : m.title}
                            </TitleLink>
                          }
                          detail={m.path}
                        />
                      </TableCell>
                      <TableCell>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp['1'] }}>
                          {missingLanguages.map((l) => (
                            <Badge key={l} tone="warning">
                              {name(l)}
                            </Badge>
                          ))}
                        </View>
                      </TableCell>
                      <TableCell align="end">
                        <Button
                          size="sm"
                          icon="search"
                          disabled={searchOne.pending}
                          accessibilityLabel={t('wanted.searchLabel', { title: m.title })}
                          onPress={() =>
                            Promise.all(missingLanguages.map((l) => searchOne.run(m.id, l))).then(
                              () => toast.success(t('wanted.found', { title: m.title })),
                              (e: Error) =>
                                toast.error(t('wanted.notFound', { title: m.title }), {
                                  description: e.message,
                                }),
                            )
                          }
                        >
                          {t('wanted.search')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
            {wanted.next && (
              <View style={{ alignItems: 'center' }}>
                <Button
                  loading={Boolean(kept)}
                  onPress={() => setCount(wanted.items.length + PAGE)}
                >
                  {t('wanted.more')}
                </Button>
              </View>
            )}
          </View>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- providers

/** The quota column's width (the web's w-56). */
const LEFT_WIDTH = 224

function Providers() {
  const t = useT(messages)
  const { role } = useShell()
  const { relative } = useRelative()
  const providers = useQuery('subtitles:providers', (c) => c.subtitles.providers(), TOPICS)
  const toggle = useAction((c, id: SubtitleProvider['id'], enabled: boolean) =>
    c.subtitles.toggleProvider({ params: { id }, body: { enabled } }),
  )
  const [editing, setEditing] = useState<SubtitleProvider | null>(null)
  const figure = tokens.adminText.figure
  return (
    <Loadable query={providers} what={t('providers.what')}>
      {(ps) => {
        const attributions = [...new Set(ps.flatMap((p) => (p.attribution ? [p.attribution] : [])))]
        return (
          <View style={{ gap: sp['3'] }}>
            <TableFrame>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('providers.provider')}</TableHead>
                    <TableHead>{t('providers.account')}</TableHead>
                    <TableHead width={LEFT_WIDTH}>{t('providers.left')}</TableHead>
                    <TableHead>{t('providers.enabled')}</TableHead>
                    {role === 'owner' && <TableHead hidden>{t('providers.actions')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ps.map((p) => {
                    const throttled =
                      p.throttledUntil !== null && Date.parse(p.throttledUntil) > Date.now()
                    const known = p.rateLimitRemaining !== null && p.rateLimitMax !== null
                    const left =
                      throttled || !known || !p.rateLimitMax
                        ? 0
                        : (p.rateLimitRemaining ?? 0) / p.rateLimitMax
                    const needsAccount = p.requiresAuth && p.account === null
                    const why =
                      p.unavailable ??
                      (needsAccount && !p.enabled ? t('providers.addAccountFirst') : null)
                    return (
                      <TableRow key={p.id}>
                        <TableCell tall truncate>
                          <TitleCell title={p.name} detail={why ?? undefined} />
                        </TableCell>
                        <TableCell>
                          <Muted>
                            {p.account ??
                              (p.requiresAuth
                                ? t('providers.needsAccount')
                                : t('providers.notNeeded'))}
                          </Muted>
                        </TableCell>
                        <TableCell>
                          <View style={{ flex: 1, minWidth: 0, gap: sp['1'] }}>
                            <View
                              style={{ flexDirection: 'row', alignItems: 'center', gap: sp['3'] }}
                            >
                              <View style={{ flex: 1 }}>
                                <ProgressBar
                                  look="panel"
                                  value={left * 100}
                                  tone={throttled || left < 0.1 ? 'warning' : 'neutral'}
                                  label={t('providers.leftLabel', { name: p.name })}
                                />
                              </View>
                              <Text size={figure.size} leading={figure.leading} mono color="text-3">
                                {known
                                  ? `${p.rateLimitRemaining}/${p.rateLimitMax}`
                                  : t('providers.unknown')}
                              </Text>
                            </View>
                            {throttled && p.throttleReason && p.throttledUntil && (
                              <Note color="warning">
                                {t(`throttle.${p.throttleReason}`, {
                                  when: relative(p.throttledUntil),
                                })}
                              </Note>
                            )}
                          </View>
                        </TableCell>
                        <TableCell>
                          <Switch
                            label={t('providers.enabledLabel', { name: p.name })}
                            hideLabel
                            checked={p.enabled}
                            disabled={
                              toggle.pending ||
                              p.unavailable !== null ||
                              (needsAccount && !p.enabled)
                            }
                            onCheckedChange={(on) =>
                              toggle
                                .run(p.id, on)
                                .catch((e: Error) =>
                                  toast.error(t('failed'), { description: e.message }),
                                )
                            }
                          />
                        </TableCell>
                        {role === 'owner' && (
                          <TableCell align="end">
                            <Button
                              size="sm"
                              icon="edit"
                              disabled={p.unavailable !== null}
                              accessibilityLabel={t('providers.editLabel', { name: p.name })}
                              hasPopup="dialog"
                              onPress={() => setEditing(p)}
                            >
                              {t('providers.edit')}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableFrame>
            {attributions.map((a) => (
              <Note key={a}>{a}</Note>
            ))}
            {editing && (
              <AccountForm key={editing.id} provider={editing} onClose={() => setEditing(null)} />
            )}
          </View>
        )
      }}
    </Loadable>
  )
}

/** Edit: the provider's account fields, Test, then Save. */
function AccountForm({
  provider: p,
  onClose,
}: {
  provider: SubtitleProvider
  onClose: () => void
}) {
  const t = useT(messages)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.fields.map((f) => [f.key, f.secret ? '' : (f.value ?? '')])),
  )
  const [result, setResult] = useState<SubtitleProviderTest | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const body = (): SubtitleProviderCredentials =>
    Object.fromEntries(
      p.fields.flatMap((f) => {
        const v = values[f.key]?.trim() ?? ''
        // a blank secret keeps the saved one
        return f.secret && !v ? [] : [[f.key, v]]
      }),
    )
  const test = useAction((c) => c.subtitles.testProvider({ params: { id: p.id }, body: body() }))
  const save = useAction((c) => c.subtitles.saveProvider({ params: { id: p.id }, body: body() }))

  const runTest = async () => {
    setFailure(null)
    setResult(null)
    try {
      setResult(await test.run())
    } catch (e) {
      setFailure((e as Error).message)
    }
  }
  const submit = async () => {
    setFailure(null)
    try {
      await save.run()
      onClose()
      toast.success(t('edit.saved', { name: p.name }))
    } catch (e) {
      setFailure((e as Error).message)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      closable
      size="md"
      title={t('edit.title', { name: p.name })}
      description={t('edit.description')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('edit.cancel')}
          </Button>
          <Button loading={test.pending} onPress={runTest}>
            {t('edit.test')}
          </Button>
          <Button variant="primary" loading={save.pending} onPress={submit}>
            {t('edit.save')}
          </Button>
        </>
      }
    >
      <View style={{ gap: sp['4'] }}>
        {p.fields.map((f) => (
          <Field
            key={f.key}
            label={t(`field.${f.key}`)}
            hint={f.secret && f.set ? t('edit.secretKept') : undefined}
          >
            <Input
              secureTextEntry={f.secret}
              value={values[f.key] ?? ''}
              onChangeText={(v) => setValues((old) => ({ ...old, [f.key]: v }))}
              onSubmitEditing={submit}
              autoComplete="off"
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
        ))}
        {result && <Answer ok={result.ok}>{result.message}</Answer>}
        {failure && <Answer ok={false}>{failure}</Answer>}
      </View>
    </Dialog>
  )
}

// ---------------------------------------------------------------- languages

const FORCED = ['no', 'also', 'only'] as const
const HI = ['no', 'also', 'only'] as const

function Languages() {
  const t = useT(messages)
  const data = useQuery(
    'subtitles:language-profiles',
    async (c) => {
      const [profiles, languages] = await Promise.all([
        c.subtitles.languageProfiles(),
        c.subtitles.languages(),
      ])
      return { profiles, languages }
    },
    TOPICS,
  )
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <Loadable query={data} what={t('languages.what')}>
      {({ profiles, languages }) => (
        <View style={{ gap: sp['4'] }}>
          {profiles.map((p) =>
            editing === p.id ? (
              <ProfileEditor
                key={p.id}
                profile={p}
                languages={languages}
                onDone={() => setEditing(null)}
              />
            ) : (
              <ProfileCard
                key={p.id}
                profile={p}
                languages={languages}
                onEdit={() => setEditing(p.id)}
              />
            ),
          )}
          {editing === 'new' ? (
            <ProfileEditor
              profile={{
                id: null,
                name: '',
                languages: [{ code: 'en', forced: 'also', hi: 'no' }],
                cutoff: null,
                minScore: 80,
              }}
              languages={languages}
              onDone={() => setEditing(null)}
            />
          ) : (
            <View style={{ alignItems: 'flex-start' }}>
              <Button icon="add" onPress={() => setEditing('new')}>
                {t('profile.new')}
              </Button>
            </View>
          )}
        </View>
      )}
    </Loadable>
  )
}

/** A profile's card, or its editor's, on `s1` (the web's `rounded-lg border bg-s1 p-4`). */
function Card({
  label,
  strong,
  children,
}: {
  label: string
  strong?: boolean
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <View
      role="region"
      aria-label={label}
      style={{
        gap: sp[strong ? '4' : '2'],
        padding: sp['4'],
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors[strong ? 'line-strong' : 'line'],
        backgroundColor: theme.colors.s1,
        minWidth: 0,
      }}
    >
      {children}
    </View>
  )
}

function ProfileCard({
  profile: p,
  languages,
  onEdit,
}: {
  profile: LanguageProfile
  languages: Language[]
  onEdit: () => void
}) {
  const t = useT(messages)
  const side = useWindowAtLeast(breakpoints.medium)
  const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code
  return (
    <Card label={p.name}>
      <View
        style={{
          flexDirection: side ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: sp['2'],
        }}
      >
        <View style={{ flex: side ? 1 : undefined, minWidth: 0, gap: sp['1'] }}>
          <Text size={ui.size} leading={ui.leading} weight={600} role="heading" aria-level={3}>
            {p.name}
          </Text>
          <View
            role="list"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp['1'] + sp['0.5'] }}
          >
            {p.languages.map((l, i) => (
              <Text key={l.code} role="listitem" variant="caption" color="text-2">
                {i + 1}. {name(l.code)}
                {l.forced !== 'no' &&
                  t(l.forced === 'only' ? 'profile.forcedOnly' : 'profile.forcedToo')}
                {l.hi !== 'no' && t(l.hi === 'only' ? 'profile.sdhOnly' : 'profile.sdhToo')}
              </Text>
            ))}
          </View>
          <Note>
            {p.cutoff ? t('profile.cutoff', { language: name(p.cutoff) }) : t('profile.noCutoff')}{' '}
            {t('profile.minScore', { score: p.minScore })}
          </Note>
        </View>
        <Button
          size="sm"
          icon="edit"
          onPress={onEdit}
          accessibilityLabel={t('profile.editLabel', { name: p.name })}
        >
          {t('profile.edit')}
        </Button>
      </View>
    </Card>
  )
}

/** A rule's select's width in a regular window (the web's 12rem). */
const RULE_WIDTH = 192
/** The add-a-language select's width (the web's w-56). */
const ADD_WIDTH = 224

/** A score field's number, held to 0 to `max`. */
const held = (text: string, max: number) => Math.max(0, Math.min(max, Number(text) || 0))

function ProfileEditor({
  profile,
  languages,
  onDone,
}: {
  profile: ProfileDraft
  languages: Language[]
  onDone: () => void
}) {
  const t = useT(messages)
  const wide = useWindowAtLeast(breakpoints.medium)
  const [draft, setDraft] = useState(profile)
  const [touched, setTouched] = useState(false)
  const save = useAction((c, p: ProfileDraft) => {
    const { id, ...body } = p
    return id
      ? c.subtitles.saveLanguageProfile({ params: { id }, body })
      : c.subtitles.createLanguageProfile({ body })
  })
  const remove = useAction((c, id: string) => c.subtitles.deleteLanguageProfile({ params: { id } }))
  const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code
  const unused = languages.filter((l) => !draft.languages.some((x) => x.code === l.code))
  const forcedOptions = FORCED.map((v) => ({ value: v, label: t(`forced.${v}`) }))
  const hiOptions = HI.map((v) => ({ value: v, label: t(`hi.${v}`) }))

  const setRule = (i: number, patch: Partial<LanguageRule>) =>
    setDraft({
      ...draft,
      languages: draft.languages.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    })
  const error = !draft.name.trim()
    ? t('profile.nameRequired')
    : !draft.languages.length
      ? t('profile.languagesRequired')
      : null

  return (
    <Card label={draft.name || t('profile.newName')} strong>
      <Field
        label={t('profile.name')}
        error={touched && !draft.name.trim() ? t('profile.nameRequired') : undefined}
      >
        <Input value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} />
      </Field>
      <View style={{ gap: sp['2'], minWidth: 0 }}>
        <Text size={ui.size} leading={ui.leading} weight={500} role="heading" aria-level={3}>
          {t('profile.languages')}
        </Text>
        <SortableList
          accessibilityLabel={t('profile.languages')}
          items={draft.languages}
          id={(l) => l.code}
          label={(l) => name(l.code)}
          onChange={(rules) => setDraft({ ...draft, languages: rules })}
          messages={{
            move: (n) => t('profile.move', { name: n }),
            moveUp: (n) => t('profile.moveUp', { name: n }),
            moveDown: (n) => t('profile.moveDown', { name: n }),
            moved: (n, index, count) => t('profile.moved', { name: n, index, count }),
            pickedUp: (n, index, count) => t('profile.pickedUp', { name: n, index, count }),
            dropped: (n, index, count) => t('profile.dropped', { name: n, index, count }),
            cancelled: (n) => t('profile.cancelled', { name: n }),
          }}
        >
          {(l, handle) => {
            const i = draft.languages.findIndex((x) => x.code === l.code)
            const words = (
              <Text size={ui.size} leading={ui.leading} style={{ flex: 1, minWidth: 0 }}>
                <Text mono size={ui.size} leading={ui.leading} color="text-3">
                  {`${i + 1}.`}
                </Text>{' '}
                {name(l.code)}
              </Text>
            )
            const forced = (
              <Select
                value={l.forced}
                onValueChange={(v) => setRule(i, { forced: v as LanguageRule['forced'] })}
                options={forcedOptions}
                aria-label={t('profile.forcedLabel', { language: name(l.code) })}
              />
            )
            const hi = (
              <Select
                value={l.hi}
                onValueChange={(v) => setRule(i, { hi: v as LanguageRule['hi'] })}
                options={hiOptions}
                aria-label={t('profile.hiLabel', { language: name(l.code) })}
              />
            )
            const drop = (
              <Button
                variant="ghost"
                iconOnly
                icon="close"
                accessibilityLabel={t('profile.remove', { language: name(l.code) })}
                onPress={() =>
                  setDraft({
                    ...draft,
                    languages: draft.languages.filter((x) => x.code !== l.code),
                    cutoff: draft.cutoff === l.code ? null : draft.cutoff,
                  })
                }
              />
            )
            // a regular window: one row; a compact one: the name and remove, the selects under
            return wide ? (
              <>
                {handle}
                {words}
                <View style={{ width: RULE_WIDTH }}>{forced}</View>
                <View style={{ width: RULE_WIDTH }}>{hi}</View>
                {drop}
              </>
            ) : (
              <>
                {handle}
                <View style={{ flex: 1, minWidth: 0, gap: sp['2'] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp['2'] }}>
                    {words}
                    {drop}
                  </View>
                  {forced}
                  {hi}
                </View>
              </>
            )
          }}
        </SortableList>
        {unused.length > 0 && (
          <View style={{ width: ADD_WIDTH, maxWidth: '100%' }}>
            <Select
              // drawn afresh once a language is added, so it shows its placeholder again
              key={draft.languages.length}
              onValueChange={(code) =>
                setDraft({
                  ...draft,
                  languages: [...draft.languages, { code, forced: 'no', hi: 'no' }],
                })
              }
              placeholder={t('profile.add')}
              aria-label={t('profile.add')}
              options={unused.map((l) => ({ value: l.code, label: l.name }))}
            />
          </View>
        )}
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: sp['4'] }}>
        <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
          <Field label={t('profile.cutoffLabel')} hint={t('profile.cutoffHint')}>
            <Select
              value={draft.cutoff ?? 'none'}
              onValueChange={(v) => setDraft({ ...draft, cutoff: v === 'none' ? null : v })}
              options={[
                { value: 'none', label: t('profile.keepLooking') },
                ...draft.languages.map((l) => ({ value: l.code, label: name(l.code) })),
              ]}
            />
          </Field>
        </View>
        <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
          <Field label={t('profile.minScoreLabel')} hint={t('profile.minScoreHint')}>
            <Input
              inputMode="numeric"
              keyboardType="number-pad"
              value={String(draft.minScore)}
              onChangeText={(v) => setDraft({ ...draft, minScore: held(v, 100) })}
            />
          </Field>
        </View>
      </View>
      {touched && error && (
        <Note color="danger" role="alert">
          {error}
        </Note>
      )}
      <View style={ROW}>
        <Button
          variant="primary"
          loading={save.pending}
          onPress={() => {
            setTouched(true)
            if (error) return
            const named = draft.name.trim()
            save.run({ ...draft, name: named }).then(
              () => {
                toast.success(t('profile.saved', { name: named }))
                onDone()
              },
              (e: Error) => toast.error(t('failed'), { description: e.message }),
            )
          }}
        >
          {t('profile.save')}
        </Button>
        <Button variant="ghost" onPress={onDone}>
          {t('profile.cancel')}
        </Button>
        {profile.id && (
          <View style={END}>
            <Button
              variant="danger"
              icon="delete"
              loading={remove.pending}
              onPress={() => {
                const id = profile.id
                if (!id) return
                remove.run(id).then(
                  () => {
                    toast({ title: t('profile.deleted', { name: profile.name }) })
                    onDone()
                  },
                  (e: Error) =>
                    toast.error(t('profile.notDeleted', { name: profile.name }), {
                      description: e.message,
                    }),
                )
              }}
            >
              {t('profile.delete')}
            </Button>
          </View>
        )}
      </View>
    </Card>
  )
}

// ---------------------------------------------------------------- scoring and sync

/** A short number field's width (the web's w-32). */
const SHORT = 128
/** The form's measure (the web's max-w-2xl). */
const FORM_WIDTH = 672

function Scoring() {
  const t = useT(messages)
  const settings = useQuery('subtitles:settings', (c) => c.subtitles.settings(), TOPICS)
  return (
    <Loadable query={settings} what={t('scoring.what')}>
      {(s) => <ScoringForm settings={s} />}
    </Loadable>
  )
}

function ScoringForm({ settings }: { settings: SubtitleSettings }) {
  const t = useT(messages)
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings])
  const save = useAction((c, body: SubtitleSettings) => c.subtitles.saveSettings({ body }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  return (
    <View style={{ maxWidth: FORM_WIDTH, gap: sp['5'] }}>
      <Field label={t('scoring.minScore')} hint={t('scoring.minScoreHint')}>
        <View style={{ width: SHORT }}>
          <Input
            inputMode="numeric"
            keyboardType="number-pad"
            value={String(draft.minScore)}
            onChangeText={(v) => setDraft({ ...draft, minScore: held(v, 100) })}
          />
        </View>
      </Field>
      <Switch
        label={t('scoring.prefer')}
        hint={t('scoring.preferHint')}
        checked={draft.preferReleaseMatch}
        onCheckedChange={(preferReleaseMatch) => setDraft({ ...draft, preferReleaseMatch })}
      />
      <Switch
        label={t('scoring.sync')}
        hint={t('scoring.syncHint')}
        checked={draft.autoSync}
        onCheckedChange={(autoSync) => setDraft({ ...draft, autoSync })}
      />
      <Field label={t('scoring.confidence')} hint={t('scoring.confidenceHint')}>
        <View style={{ width: SHORT }}>
          <Select
            value={String(draft.minConfidence)}
            onValueChange={(v) => setDraft({ ...draft, minConfidence: Number(v) })}
            options={[0.5, 0.6, 0.7, 0.8, 0.9].map((v) => ({
              value: String(v),
              label: percent(v),
            }))}
            disabled={!draft.autoSync}
          />
        </View>
      </Field>
      <Field label={t('scoring.upgrade')} hint={t('scoring.upgradeHint')}>
        {/* the unit after the field: the web draws it inside the field's end */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp['2'] }}>
          <View style={{ width: SHORT }}>
            <Input
              inputMode="numeric"
              keyboardType="number-pad"
              value={String(draft.upgradeDays)}
              onChangeText={(v) => setDraft({ ...draft, upgradeDays: held(v, 365) })}
            />
          </View>
          <Note>{t('scoring.days')}</Note>
        </View>
      </Field>
      <View style={ROW}>
        <Button
          variant="primary"
          disabled={!dirty}
          loading={save.pending}
          onPress={() =>
            save.run(draft).then(
              () => toast.success(t('scoring.saved')),
              (e: Error) => toast.error(t('failed'), { description: e.message }),
            )
          }
        >
          {t('scoring.save')}
        </Button>
        <Button variant="ghost" disabled={!dirty} onPress={() => setDraft(settings)}>
          {t('scoring.discard')}
        </Button>
      </View>
    </View>
  )
}
