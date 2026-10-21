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
import type {
  Language,
  LanguageProfile,
  SubtitleProvider,
  SubtitleProviderCredentials,
  SubtitleProviderTest,
  SubtitleSettings,
  WantedSubtitlesPage,
} from '@highsea/api-contract'
import { percent } from '@highsea/core/format'
import { useT } from '@highsea/i18n/react'
import type { HighseaClient } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Progress,
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
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
  toast,
} from '@highsea/ui-web'
import { useEffect, useRef, useState } from 'react'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { AdminPage, useShell } from './shell.tsx'
import { subtitles as messages } from './subtitles-messages.ts'
import { useRelative } from './time.ts'

type Tab = 'wanted' | 'providers' | 'languages' | 'scoring'
type LanguageRule = LanguageProfile['languages'][number]
type ProfileDraft = Omit<LanguageProfile, 'id'> & { id: string | null }

const TOPICS = ['subtitles.updated']
/** Movies a page of the wanted list adds. */
const PAGE = 50

export function Subtitles() {
  const t = useT(messages)
  const [tab, setTab] = useState<Tab>('wanted')
  const total = useQuery(
    'subtitles:wanted-total',
    async (c) => (await c.subtitles.wanted({ query: { limit: 1 } })).total,
    TOPICS,
  )
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <Stats />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label={t('sections')} className="max-w-full overflow-x-auto">
          <TabsTrigger value="wanted" count={total.data || undefined}>
            {t('tab.wanted')}
          </TabsTrigger>
          <TabsTrigger value="providers">{t('tab.providers')}</TabsTrigger>
          <TabsTrigger value="languages">{t('tab.languages')}</TabsTrigger>
          <TabsTrigger value="scoring">{t('tab.scoring')}</TabsTrigger>
        </TabsList>
        <TabsContent value="wanted" className="pt-5">
          <Wanted />
        </TabsContent>
        <TabsContent value="providers" className="pt-5">
          <Providers />
        </TabsContent>
        <TabsContent value="languages" className="pt-5">
          <Languages />
        </TabsContent>
        <TabsContent value="scoring" className="pt-5">
          <Scoring />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

function Stats() {
  const t = useT(messages)
  const stats = useQuery('subtitles:stats', (c) => c.subtitles.stats(), TOPICS)
  if (stats.status !== 'success') return null
  const s = stats.data
  return (
    <div className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-4">
      <Stat value={String(s.syncedToday)} caption={t('stats.synced')} />
      <Stat value={String(s.waiting)} caption={t('stats.waiting')} />
      <Stat value={String(s.avgOffsetMs)} unit="ms" caption={t('stats.offset')} />
      <Stat value={percent(s.avgConfidence)} caption={t('stats.confidence')} />
    </div>
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
    ? { status: 'success' as const, data: kept, error: undefined, refetch: data.refetch }
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
          <div className="grid gap-4">
            <TableFrame>
              <TableToolbar>
                <span className="text-text">{t('wanted.count', { count: wanted.total })}</span>
                <Button
                  size="sm"
                  icon="search"
                  className="ms-auto"
                  loading={searchAll.pending}
                  onClick={() =>
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
              </TableToolbar>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('wanted.movie')}</TableHead>
                    <TableHead>{t('wanted.missing')}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t('wanted.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wanted.items.map(({ movie: m, missingLanguages }) => (
                    <TableRow key={m.id}>
                      <TitleCell
                        title={
                          <a href={moviePath(m.id)} className="hover:underline">
                            {m.year ? `${m.title} (${m.year})` : m.title}
                          </a>
                        }
                        detail={m.path}
                      />
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {missingLanguages.map((l) => (
                            <Badge key={l} tone="warning">
                              {name(l)}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          icon="search"
                          disabled={searchOne.pending}
                          aria-label={t('wanted.searchLabel', { title: m.title })}
                          onClick={() =>
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
              <Button
                className="justify-self-center"
                loading={Boolean(kept)}
                onClick={() => setCount(wanted.items.length + PAGE)}
              >
                {t('wanted.more')}
              </Button>
            )}
          </div>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- providers

function Providers() {
  const t = useT(messages)
  const { role } = useShell()
  const { relative } = useRelative()
  const providers = useQuery('subtitles:providers', (c) => c.subtitles.providers(), TOPICS)
  const toggle = useAction((c, id: SubtitleProvider['id'], enabled: boolean) =>
    c.subtitles.toggleProvider({ params: { id }, body: { enabled } }),
  )
  const [editing, setEditing] = useState<SubtitleProvider | null>(null)
  return (
    <Loadable query={providers} what={t('providers.what')}>
      {(ps) => {
        const attributions = [...new Set(ps.flatMap((p) => (p.attribution ? [p.attribution] : [])))]
        return (
          <div className="grid gap-3">
            <TableFrame>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('providers.provider')}</TableHead>
                    <TableHead>{t('providers.account')}</TableHead>
                    <TableHead>{t('providers.left')}</TableHead>
                    <TableHead>{t('providers.enabled')}</TableHead>
                    {role === 'owner' && (
                      <TableHead>
                        <span className="sr-only">{t('providers.actions')}</span>
                      </TableHead>
                    )}
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
                        <TitleCell title={p.name} detail={why ?? undefined} />
                        <TableCell className="text-text-2">
                          {p.account ??
                            (p.requiresAuth
                              ? t('providers.needsAccount')
                              : t('providers.notNeeded'))}
                        </TableCell>
                        <TableCell className="w-56">
                          <span className="flex items-center gap-3">
                            <Progress
                              value={left * 100}
                              tone={throttled || left < 0.1 ? 'warning' : 'neutral'}
                              aria-label={t('providers.leftLabel', { name: p.name })}
                              className="flex-1"
                            />
                            <span className="font-mono text-figure text-text-3">
                              {known
                                ? `${p.rateLimitRemaining}/${p.rateLimitMax}`
                                : t('providers.unknown')}
                            </span>
                          </span>
                          {throttled && p.throttleReason && p.throttledUntil && (
                            <span className="mt-1 block text-caption text-warning">
                              {t(`throttle.${p.throttleReason}`, {
                                when: relative(p.throttledUntil),
                              })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
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
                            aria-label={t('providers.enabledLabel', { name: p.name })}
                          />
                        </TableCell>
                        {role === 'owner' && (
                          <TableCell className="text-end">
                            <Button
                              size="sm"
                              icon="edit"
                              disabled={p.unavailable !== null}
                              aria-label={t('providers.editLabel', { name: p.name })}
                              onClick={() => setEditing(p)}
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
              <p key={a} className="text-caption text-text-3">
                {a}
              </p>
            ))}
            <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
              {editing && (
                <AccountForm key={editing.id} provider={editing} onClose={() => setEditing(null)} />
              )}
            </Dialog>
          </div>
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
    <DialogContent
      size="md"
      title={t('edit.title', { name: p.name })}
      description={t('edit.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('edit.cancel')}
          </Button>
          <Button loading={test.pending} onClick={runTest}>
            {t('edit.test')}
          </Button>
          <Button variant="primary" loading={save.pending} onClick={submit}>
            {t('edit.save')}
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
        {p.fields.map((f) => (
          <Field
            key={f.key}
            label={t(`field.${f.key}`)}
            hint={f.secret && f.set ? t('edit.secretKept') : undefined}
          >
            <Input
              type={f.secret ? 'password' : 'text'}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((old) => ({ ...old, [f.key]: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        ))}
        {result && (
          <p
            role={result.ok ? 'status' : 'alert'}
            className={`rounded-md border border-line bg-s2 p-3 text-caption ${result.ok ? 'text-success' : 'text-danger'}`}
          >
            {result.message}
          </p>
        )}
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
        <div className="grid gap-4">
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
            <Button icon="add" onClick={() => setEditing('new')} className="justify-self-start">
              {t('profile.new')}
            </Button>
          )}
        </div>
      )}
    </Loadable>
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
  const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code
  return (
    <section
      aria-label={p.name}
      className="grid gap-2 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[1fr_auto]"
    >
      <div className="grid gap-1">
        <h3 className="font-semibold text-text text-ui">{p.name}</h3>
        <ol className="flex flex-wrap gap-1.5 text-caption text-text-2">
          {p.languages.map((l, i) => (
            <li key={l.code}>
              {i + 1}. {name(l.code)}
              {l.forced !== 'no' &&
                t(l.forced === 'only' ? 'profile.forcedOnly' : 'profile.forcedToo')}
              {l.hi !== 'no' && t(l.hi === 'only' ? 'profile.sdhOnly' : 'profile.sdhToo')}
            </li>
          ))}
        </ol>
        <p className="text-caption text-text-3">
          {p.cutoff ? t('profile.cutoff', { language: name(p.cutoff) }) : t('profile.noCutoff')}{' '}
          {t('profile.minScore', { score: p.minScore })}
        </p>
      </div>
      <Button
        size="sm"
        icon="edit"
        onClick={onEdit}
        aria-label={t('profile.editLabel', { name: p.name })}
        className="self-start"
      >
        {t('profile.edit')}
      </Button>
    </section>
  )
}

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
    <section
      aria-label={draft.name || t('profile.newName')}
      className="grid gap-4 rounded-lg border border-line-strong bg-s1 p-4"
    >
      <Field
        label={t('profile.name')}
        error={touched && !draft.name.trim() ? t('profile.nameRequired') : undefined}
      >
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </Field>
      <div className="grid gap-2">
        <h3 className="font-medium text-text text-ui">{t('profile.languages')}</h3>
        <SortableList
          aria-label={t('profile.languages')}
          items={draft.languages}
          id={(l) => l.code}
          label={(l) => name(l.code)}
          onChange={(languages) => setDraft({ ...draft, languages })}
          className="gap-2"
          itemClassName="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-line bg-s2 p-2.5 medium:grid-cols-[auto_minmax(0,1fr)_12rem_12rem_auto]"
        >
          {(l, handle) => {
            const i = draft.languages.findIndex((x) => x.code === l.code)
            return (
              <>
                {handle}
                <span className="text-text text-ui">
                  <span className="font-mono text-text-3">{i + 1}.</span> {name(l.code)}
                </span>
                <Select
                  value={l.forced}
                  onValueChange={(v) => setRule(i, { forced: v as LanguageRule['forced'] })}
                  options={forcedOptions}
                  aria-label={t('profile.forcedLabel', { language: name(l.code) })}
                  className="col-span-3 medium:col-span-1"
                />
                <Select
                  value={l.hi}
                  onValueChange={(v) => setRule(i, { hi: v as LanguageRule['hi'] })}
                  options={hiOptions}
                  aria-label={t('profile.hiLabel', { language: name(l.code) })}
                  className="col-span-3 medium:col-span-1"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="close"
                  aria-label={t('profile.remove', { language: name(l.code) })}
                  className="col-start-3 row-start-1 medium:col-start-auto medium:row-start-auto"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      languages: draft.languages.filter((x) => x.code !== l.code),
                      cutoff: draft.cutoff === l.code ? null : draft.cutoff,
                    })
                  }
                />
              </>
            )
          }}
        </SortableList>
        {unused.length > 0 && (
          <Select
            value=""
            onValueChange={(code) =>
              setDraft({
                ...draft,
                languages: [...draft.languages, { code, forced: 'no', hi: 'no' }],
              })
            }
            placeholder={t('profile.add')}
            aria-label={t('profile.add')}
            options={unused.map((l) => ({ value: l.code, label: l.name }))}
            className="w-56"
          />
        )}
      </div>
      <div className="grid gap-4 medium:grid-cols-2">
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
        <Field label={t('profile.minScoreLabel')} hint={t('profile.minScoreHint')}>
          <Input
            inputMode="numeric"
            value={String(draft.minScore)}
            onChange={(e) =>
              setDraft({
                ...draft,
                minScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
              })
            }
          />
        </Field>
      </div>
      {touched && error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={save.pending}
          onClick={() => {
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
        <Button variant="ghost" onClick={onDone}>
          {t('profile.cancel')}
        </Button>
        {profile.id && (
          <Button
            variant="danger"
            icon="delete"
            className="ms-auto"
            loading={remove.pending}
            onClick={() => {
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
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- scoring and sync

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
    <div className="grid max-w-2xl gap-5">
      <Field label={t('scoring.minScore')} hint={t('scoring.minScoreHint')}>
        <Input
          inputMode="numeric"
          value={String(draft.minScore)}
          onChange={(e) =>
            setDraft({
              ...draft,
              minScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            })
          }
          className="w-32"
        />
      </Field>
      <Field inline label={t('scoring.prefer')} hint={t('scoring.preferHint')}>
        <Switch
          checked={draft.preferReleaseMatch}
          onCheckedChange={(preferReleaseMatch) => setDraft({ ...draft, preferReleaseMatch })}
        />
      </Field>
      <Field inline label={t('scoring.sync')} hint={t('scoring.syncHint')}>
        <Switch
          checked={draft.autoSync}
          onCheckedChange={(autoSync) => setDraft({ ...draft, autoSync })}
        />
      </Field>
      <Field label={t('scoring.confidence')} hint={t('scoring.confidenceHint')}>
        <Select
          value={String(draft.minConfidence)}
          onValueChange={(v) => setDraft({ ...draft, minConfidence: Number(v) })}
          options={[0.5, 0.6, 0.7, 0.8, 0.9].map((v) => ({ value: String(v), label: percent(v) }))}
          disabled={!draft.autoSync}
          className="w-32"
        />
      </Field>
      <Field label={t('scoring.upgrade')} hint={t('scoring.upgradeHint')}>
        <Input
          inputMode="numeric"
          value={String(draft.upgradeDays)}
          onChange={(e) =>
            setDraft({
              ...draft,
              upgradeDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)),
            })
          }
          end={<span className="text-caption text-text-3">{t('scoring.days')}</span>}
          className="w-32"
        />
      </Field>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!dirty}
          loading={save.pending}
          onClick={() =>
            save.run(draft).then(
              () => toast.success(t('scoring.saved')),
              (e: Error) => toast.error(t('failed'), { description: e.message }),
            )
          }
        >
          {t('scoring.save')}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(settings)}>
          {t('scoring.discard')}
        </Button>
      </div>
    </div>
  )
}
